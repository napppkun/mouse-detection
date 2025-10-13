// src/pages/DailyRecord.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { auth } from "../firebase";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

// Return YYYY-MM-DD (UTC+7)
const getTodayThaiISOString = () => {
  const now = new Date();
  const thailandOffset = 7 * 60 * 60 * 1000;
  const localDate = new Date(now.getTime() + thailandOffset);
  return localDate.toISOString().split("T")[0];
};

export default function DailyRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    date: getTodayThaiISOString(),
    groupName: "",
    weight: "",
  });

  const [existingDates, setExistingDates] = useState([]);
  const [volumeIntake, setVolumeIntake] = useState("");
  const [mouseCode, setMouseCode] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // โหลดข้อมูลหนู: code และวันที่เคยบันทึก
  useEffect(() => {
    const fetchMouse = async () => {
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
        const data = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return { message: text };
          }
        })();

        if (!res.ok) {
          setErr(data.message || "Error fetching mouse data");
          setMouseCode("");
          setExistingDates([]);
          return;
        }

        setMouseCode(data.code || "");

        const dates = (Array.isArray(data.dailyRecord) ? data.dailyRecord : []).map((r) => {
          const dateObj = new Date(r.date);
          const offset = 7 * 60 * 60 * 1000;
          const th = new Date(dateObj.getTime() + offset);
          return th.toISOString().split("T")[0];
        });
        setExistingDates(dates);
      } catch (error) {
        console.error("Error fetching data:", error);
        setErr("Error fetching data");
        setMouseCode("");
        setExistingDates([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMouse();
  }, [id, navigate, location]);

  // คำนวณ volume intake จากน้ำหนัก
  useEffect(() => {
    const w = parseFloat(formData.weight);
    if (!Number.isNaN(w) && w >= 0) {
      const calc = Math.min(w / 200, 0.2);
      setVolumeIntake(calc.toFixed(3));
    } else {
      setVolumeIntake("");
    }
  }, [formData.weight]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const duplicateDate = existingDates.includes(formData.date);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (duplicateDate) {
      alert("Existing record for this date. Please choose another date.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }
      const idToken = await user.getIdToken(true);

      const res = await fetch(`${BACKEND_URL}/api/mice/${id}/daily-record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(formData),
      });

      const text = await res.text();
      const data = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return { message: text };
        }
      })();

      if (!res.ok) {
        alert("Save failed: " + (data.message || "Unknown error"));
        return;
      }

      alert("Save successfully!");
      navigate("/manage-mice");
    } catch (error) {
      console.error("Error saving daily record:", error);
      alert("Error saving daily record");
    }
  };

  return (
    <div className="app-main">
      <div className="main-wrap">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add daily record</h3>

          {loading ? (
            <p>Loading...</p>
          ) : err ? (
            <p style={{ color: "#ef4444" }}>{err}</p>
          ) : (

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
              <div className="form-row">
                <label>CODE</label>
                <input className="input" value={mouseCode} disabled />
              </div>

              <div className="form-row">
                <label>Date</label>
                <input
                  className="input"
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  max={getTodayThaiISOString()}
                  required
                />
              </div>

              {duplicateDate && (
                <p style={{ color: "#ef4444", marginTop: -8 }}>
                  Existing record for today. Please choose another date.
                </p>
              )}

              <div className="form-row">
                <label>Group</label>
                <input
                  className="input"
                  type="text"
                  name="groupName"
                  value={formData.groupName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <label>Body weight (g)</label>
                <input
                  className="input"
                  type="number"
                  name="weight"
                  min="0"
                  step="any"
                  value={formData.weight}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <label>Volume intake (mL)</label>
                <input className="input" value={volumeIntake} readOnly />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn primary" type="submit" disabled={duplicateDate}>
                  Submit
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
