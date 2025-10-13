// src/pages/MouseDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../firebase";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

const formatDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function MouseDetailPage() {
  const { id } = useParams(); // /mouse/:id
  const navigate = useNavigate();
  const location = useLocation(); // รับ state ที่ส่งมาจากหน้าเดิม (ถ้ามี)

  const [mouse, setMouse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setErr("");

      const user = auth.currentUser;
      if (!user) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }
      const idToken = await user.getIdToken(true);

      const res = await fetch(`${BACKEND_URL}/api/mice/${id}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const text = await res.text();
      const data = (() => { try { return JSON.parse(text); } catch { return text; } })();
      if (!res.ok || !data || typeof data !== "object") {
        setErr(data?.message || "Error fetching mouse");
        setMouse(null);
        return;
      }

      setMouse(data);
    } catch (e) {
      console.error(e);
      setErr("Error fetching mouse");
      setMouse(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const handleDeleteRecord = async (recordId) => {
    const ok = window.confirm("Do you want to delete?");
    if (!ok) return;

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }
      const idToken = await user.getIdToken(true);

      const res = await fetch(`${BACKEND_URL}/api/records/${recordId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const text = await res.text();
      const data = (() => { try { return JSON.parse(text); } catch { return text; } })();
      if (!res.ok) {
        alert("Error: " + (data?.message || "Delete failed"));
        return;
      }

      setMouse((prev) =>
        prev ? { ...prev, dailyRecord: (prev.dailyRecord || []).filter((r) => r._id !== recordId) } : prev
      );
      alert("Delete successfully");
    } catch (e) {
      console.error(e);
      alert("Delete failed");
    }
  };

  const records = mouse?.dailyRecord ?? [];

  const handleBack = () => {
    // ถ้ามาจากหน้า manage-mice ให้ย้อนกลับ (-1) เพื่อคง search/page state เดิม
    if (location.state?.from === "manage-mice") navigate(-1);
    else navigate("/manage-mice");
  };

  return (
    <div className="card" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Toolbar */}
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>
          Mouse Details: <span style={{ color: "#0f172a" }}>{mouse?.code || "-"}</span>
        </h3>
        <div className="btn-group">
          {/* <button
            type="button"
            className="btn"
            onClick={handleBack}
            title="Back to Manage Mice"
          >
            Back
          </button> */}
          <button
            type="button"
            className="btn primary"
            onClick={() => navigate(`/mouse/${id}/daily-record`, { state: location.state })}
            title="Add Daily Record"
          >
            Add Daily Record
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p>Data loading…</p>
      ) : err ? (
        <p style={{ color: "#ef4444" }}>{err}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Weight (g)</th>
              <th>Group</th>
              <th>Volume Intake (mL)</th>
              <th style={{ width: 180 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center" }}>Data not found</td></tr>
            ) : (
              records.map((record) => (
                <tr key={record._id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{record.weight}</td>
                  <td>{record.group?.name || "-"}</td>
                  <td>{record.volumeIntake}</td>
                  <td>
                    <div className="btn-group">
                      <button
                        className="btn"
                        onClick={() => navigate(`/edit-record/${id}/${record._id}`, { state: location.state })}
                      >
                        Edit
                      </button>
                      <button
                        className="btn danger"
                        onClick={() => handleDeleteRecord(record._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
