// src/pages/HomePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import "../styles/app.css";

const BACKEND_URL =
  window._env_?.BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:5000";

const API_BASE = `${BACKEND_URL}/api/tests`;
const LATEST_LIMIT = 5;

function prettyBehavior(behaviorTest) {
  if (!behaviorTest) return "-";
  const v = String(behaviorTest).toLowerCase();
  if (v.includes("elevated")) return "Elevated Plus Maze (EPM)";
  if (v.includes("ymaze") || v === "y-maze" || v === "y maze") return "Y-Maze";
  if (v.includes("morris") || v.includes("mwm")) return "Morris Water Maze (MWM)";
  return behaviorTest;
}

function prettyStatus(status) {
  if (!status) return "-";
  const s = String(status).toLowerCase();
  if (s === "configured") return "Configured";
  if (s === "processing") return "Processing";
  if (s === "completed") return "Completed";
  if (s === "failed") return "Failed";
  if (s === "created") return "Draft";
  return status;
}

function formatDate(d) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

export default function HomePage() {
  const navigate = useNavigate();

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [idToken, setIdToken] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate("/login", { replace: true, state: { from: "/" } });
        return;
      }
      const tok = await u.getIdToken(false);
      setIdToken(tok);
      fetchTests(tok);
    });
    return unsub;
  }, []);

  async function fetchTests(token) {
    try {
      setLoading(true);
      setErr("");

      const res = await fetch(`${API_BASE}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to fetch tests");
      }

      const json = await res.json();
      const list =
        json?.data ||
        json?.tests ||
        (Array.isArray(json) ? json : []);

      // เรียงจากใหม่ไปเก่า (ใช้ createdAt หรือ date หรือตามที่มี)
      const sorted = [...list].sort((a, b) => {
        const ad = a.createdAt || a.date || 0;
        const bd = b.createdAt || b.date || 0;
        return new Date(bd) - new Date(ad);
      });

      setTests(sorted);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load tests");
    } finally {
      setLoading(false);
    }
  }

  // สรุปข้อมูลสำหรับ dashboard
  const dashboard = useMemo(() => {
    const total = tests.length;
    const byType = { epm: 0, ymaze: 0, mwm: 0, other: 0 };

    for (const t of tests) {
      const v = String(t.behaviorTest || "").toLowerCase();
      if (v.includes("elevated")) byType.epm += 1;
      else if (v.includes("ymaze") || v === "y-maze" || v === "y maze") byType.ymaze += 1;
      else if (v.includes("morris") || v.includes("mwm")) byType.mwm += 1;
      else byType.other += 1;
    }

    return { total, ...byType };
  }, [tests]);

  const latest = useMemo(() => tests.slice(0, LATEST_LIMIT), [tests]);

  const handleRowClick = (id) => {
    if (!id) return;
    navigate(`/tests/${id}`);
  };

  if (loading) {
    return (
      <div className="app-main">
        <div className="main-wrap">
          <div className="card">
            <p>Loading tests…</p>
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="app-main">
        <div className="main-wrap">
          <div className="card">
            <p style={{ color: "var(--danger)" }}>{err}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <div className="main-wrap" style={{ display: "grid", gap: 16 }}>
        {/* Dashboard Summary */}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Dashboard</h3>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {/* Total Tests */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "#0f172a",
                color: "#e5e7eb",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              Total Tests
              <div>
                {dashboard.total}
              </div>
            </div>

            {/* EPM */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "#f0fdf4",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 18,
                color: "#166534",
              }}
            >
              EPM
              <div>
                {dashboard.epm}
              </div>
            </div>

            {/* Y-Maze */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "#eff6ff",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 18,
                color: "#1d4ed8",
              }}
            >
              Y-Maze
              <div>
                {dashboard.ymaze}
              </div>
            </div>

            {/* MWM */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "#ecfeff",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 18,
                color: "#0369a1",
              }}
            >
              MWM
              <div>
                {dashboard.mwm}
              </div>
            </div>
          </div>
        </div>

        {/* Latest tests list */}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h4 style={{ margin: 0 }}>Recent Tests</h4>
            <div className="muted" style={{ fontSize: 12 }}>
              Showing {latest.length} of {tests.length}
            </div>
          </div>

          {latest.length === 0 ? (
            <div className="muted">
              No tests found. Create a new test to get started.
            </div>
          ) : (
            <div
              style={{
                borderRadius: 6,
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead style={{ backgroundColor: "#f9fafb" }}>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                      }}
                    >
                      Name
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                      }}
                    >
                      Behavioral Test
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                      }}
                    >
                      Created
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "8px 12px",
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((t) => (
                    <tr
                      key={t._id}
                      style={{
                        cursor: "pointer",
                        borderTop: "1px solid var(--border)",
                      }}
                      onClick={() => handleRowClick(t._id)}
                    >
                      <td
                        style={{
                          padding: "8px 12px",
                          maxWidth: 260,
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>
                          {t.name || "-"}
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span className="muted">
                          {prettyBehavior(t.behaviorTest)}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            backgroundColor:
                              String(t.status).toLowerCase() === "completed"
                                ? "#dcfce7"
                                : String(t.status).toLowerCase() === "processing"
                                  ? "#fef3c7"
                                  : String(t.status).toLowerCase() === "failed"
                                    ? "#fee2e2"
                                    : "#e5e7eb",
                          }}
                        >
                          {prettyStatus(t.status)}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span className="muted">
                          {formatDate(t.createdAt || t.date)}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                        }}
                      >
                        <button
                          className="btn"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(t._id);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
