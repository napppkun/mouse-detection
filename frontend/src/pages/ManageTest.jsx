// src/pages/ManageTest.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Search } from "lucide-react";
import "../styles/app.css";
import { useProgress } from "../context/ProgressCenter";

export default function ManageTest() {
  const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
  const API_BASE = (BACKEND_URL.endsWith('/') ? BACKEND_URL : BACKEND_URL + '/') + "api/tests";
  const navigate = useNavigate();
  const location = useLocation();

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // inline edit states
  const [editingId, setEditingId] = useState(null);
  const [editingVal, setEditingVal] = useState("");
  const [savingName, setSavingName] = useState(false);

  const userRef = useRef(null);
  const pollRef = useRef(null);

  const { removeJobsByTestId } = useProgress();

  const terminalStatuses = new Set(["completed", "failed"]);
  const isPendingAny = (list) =>
    list.some((t) => !terminalStatuses.has((t.status || "").toLowerCase()));

  // ---- utils ----
  const safeName = (s) =>
    String(s || "")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "file";

  const fetchTests = async (idToken) => {
    setError("");
    try {
      const res = await fetch(`${API_BASE}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("Please log in");
          setTests([]);
          return;
        }
        const msg = await res.text();
        setError(msg || "Error fetching data");
        setTests([]);
        return;
      }

      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.data || [];
      setTests(rows);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Error fetching data");
      setTests([]);
    } finally {
      setLoading(false);
    }
  };

  // init auth + first load
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }
      userRef.current = u;
      const idToken = await u.getIdToken(false);
      setLoading(true);
      fetchTests(idToken);
    });
    return unsub;
  }, [navigate, location]);

  // polling while there are non-terminal tests
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!tests.length) return;

    if (isPendingAny(tests)) {
      pollRef.current = setInterval(async () => {
        const u = userRef.current;
        if (!u) return;
        const idToken = await u.getIdToken(false);
        fetchTests(idToken);
      }, 4000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tests]);

  const handleDelete = async (id) => {
    const ok = window.confirm(
      "Delete this test? (Videos will be removed as well)"
    );
    if (!ok) return;

    const u = auth.currentUser;
    if (!u) {
      alert("Please log in");
      navigate("/login", { replace: true, state: { from: location } });
      return;
    }

    try {
      const idToken = await u.getIdToken(false);
      const res = await fetch(`${API_BASE}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "Delete failed");
      removeJobsByTestId(id);
      setTests((prev) => prev.filter((m) => m._id !== id));
    } catch (err) {
      console.error("Error deleting test:", err);
      alert(err.message || "Error deleting test");
    }
  };

  const filtered = useMemo(() => {
    const term = (search || "").toLowerCase();
    if (!term) return tests;
    return tests.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(term) ||
        (t.behaviorTest || "").toLowerCase().includes(term) ||
        (t.status || "").toLowerCase().includes(term)
    );
  }, [tests, search]);

  // ---------- Download Excel (report) ----------
  const downloadExcelForTest = async (test) => {
    try {
      const u = auth.currentUser;
      if (!u) throw new Error("Please log in");
      const token = await u.getIdToken(false);

      // build/refresh report
      const resp = await fetch(`${API_BASE}/${test._id}/report/build`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.message || "Failed to build report");

      const url = json?.reportUrl;
      if (!url) throw new Error("Report built but URL not returned");

      const namePart = safeName(test.name || `test_${test._id}`);
      const mazePart = safeName(test.behaviorTest || "report");
      const niceName = `${namePart}_${mazePart}.xlsx`;

      const fileResp = await fetch(url);
      if (!fileResp.ok) throw new Error("Failed to fetch report file");
      const blob = await fileResp.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = niceName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to download Excel.");
    }
  };

  // ---------- Inline edit test name ----------
  const startEdit = (row) => {
    // ถ้ากำลังประมวลผล ไม่ให้แก้ (ฝั่ง backend ก็กันอยู่)
    if ((row.status || "").toLowerCase() === "processing") {
      alert("Cannot edit while processing");
      return;
    }
    setEditingId(row._id);
    setEditingVal(row.name || "");
    setTimeout(() => {
      const el = document.getElementById(`edit-input-${row._id}`);
      if (el) el.focus();
    }, 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingVal("");
    setSavingName(false);
  };

  const saveEdit = async (row) => {
    if (!editingId) return;
    const newName = (editingVal || "").trim();
    if (!newName) {
      alert("Please enter a test name");
      return;
    }
    try {
      setSavingName(true);
      const u = auth.currentUser;
      if (!u) throw new Error("Please log in");
      const token = await u.getIdToken(false);

      // ใช้ PUT/patch อัปเดตชื่อ
      const resp = await fetch(`${API_BASE}/${row._id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
      });
      const js = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(js?.message || "Update failed");

      // อัปเดตในตาราง
      setTests((prev) =>
        prev.map((t) => (t._id === row._id ? { ...t, name: newName } : t))
      );
      cancelEdit();
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to update test name");
      setSavingName(false);
    }
  };

  // key handlers for input
  const onNameKeyDown = (e, row) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div className="app-main">
      <div className="main-wrap">
        <div className="card">
          {/* Header + Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <h3 style={{ margin: 0 }}>Manage Test</h3>

            <div className="search-wrap" style={{ margin: 0, minWidth: 340 }}>
              <input
                className="search-pill"
                placeholder="Search by name, maze, status"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search className="search-icon" />
            </div>
          </div>

          {/* Create */}
          <button
            type="button"
            className="btn primary"
            style={{ height: 38, marginTop: 12 }}
            onClick={() => navigate("/create-test")}
          >
            Create New Test
          </button>

          {/* Table */}
          <div style={{ marginTop: 16 }}>
            {loading ? (
              <p>Loading Tests...</p>
            ) : error ? (
              <p style={{ color: "var(--danger)" }}>{error}</p>
            ) : filtered.length === 0 ? (
              <p>Data Not Found</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Test Name</th>
                    <th>Behavioral Test</th>
                    <th>Status</th>
                    <th style={{ width: 420 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const isCompleted =
                      (t.status || "").toLowerCase() === "completed";
                    const isEditing = editingId === t._id;
                    return (
                      <tr key={t._id}>
                        <td>
                          {isEditing ? (
                            <input
                              id={`edit-input-${t._id}`}
                              className="input"
                              value={editingVal}
                              onChange={(e) => setEditingVal(e.target.value)}
                              onKeyDown={(e) => onNameKeyDown(e, t)}
                              style={{
                                width: "100%",
                                background: "#fffbe6",
                                borderColor: "var(--warning,#f0ad4e)",
                                outline: "2px solid rgba(240,173,78,0.35)",
                              }}
                            />
                          ) : (
                            t.name
                          )}
                        </td>
                        <td>{t.behaviorTest}</td>
                        <td className="capitalize">
                          {t.status || "-"}
                          {!terminalStatuses.has(
                            (t.status || "").toLowerCase()
                          ) && (
                            <span className="muted" style={{ marginLeft: 8 }}>
                              (updating…)
                            </span>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="btn"
                              style={{ height: 36, padding: "0 14px" }}
                              onClick={() => navigate(`/tests/${t._id}`)}
                            >
                              Details
                            </button>

                            {/* Download Excel */}
                            <button
                              type="button"
                              className="btn"
                              style={{ height: 36, padding: "0 14px" }}
                              disabled={!isCompleted}
                              title={
                                isCompleted
                                  ? "Download test summary Excel"
                                  : "Available after completed"
                              }
                              onClick={() => downloadExcelForTest(t)}
                            >
                              Download Excel
                            </button>

                            {/* Edit / Save test name */}
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="btn primary"
                                  style={{ height: 36, padding: "0 14px" }}
                                  disabled={savingName}
                                  onClick={() => saveEdit(t)}
                                >
                                  {savingName ? "Saving…" : "Save test name"}
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ height: 36, padding: "0 14px" }}
                                  disabled={savingName}
                                  onClick={cancelEdit}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn"
                                style={{ height: 36, padding: "0 14px" }}
                                onClick={() => startEdit(t)}
                              >
                                Edit test name
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn danger"
                              style={{ height: 36, padding: "0 14px" }}
                              onClick={() => handleDelete(t._id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
