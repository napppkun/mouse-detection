import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function ManageMice() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mice, setMice] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [search, setSearch] = useState("");

  const [editingCode, setEditingCode] = useState("");
  const [editingId, setEditingId]     = useState(null);
  const [savingId, setSavingId]       = useState(null);

  const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
  const API_BASE = (BACKEND_URL.endsWith('/') ? BACKEND_URL : BACKEND_URL + '/') + "api/mice";

  const fetchData = async (idToken) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("Please log in");
          setMice([]);
          return;
        }
        setError("Error fetching data");
        setMice([]);
        return;
      }

      const data = await res.json();
      setMice(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Error fetching data");
      setMice([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }
      const idToken = await u.getIdToken(true);
      fetchData(idToken);
    });
    return unsub;
  }, [navigate, location]);

  const handleDelete = async (id) => {
    const ok = window.confirm("Do you want to delete?");
    if (!ok) return;

    const u = auth.currentUser;
    if (!u) {
      alert("Please log in");
      navigate("/login", { replace: true, state: { from: location } });
      return;
    }

    try {
      const idToken = await u.getIdToken(true);
      const res = await fetch(`${API_BASE}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "Delete failed");

      alert("Delete successfully!");
      setMice((prev) => prev.filter((m) => m._id !== id));
    } catch (err) {
      console.error("Error deleting mouse data:", err);
      alert("Error deleting mouse data");
    }
  };

  // ---- Inline edit handlers (กัน event นำทาง/submit ไม่ตั้งใจ) ----
  const startEdit = (e, mouse) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setEditingId(mouse._id);
    setEditingCode(mouse.code || "");
  };

  const cancelEdit = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setEditingId(null);
    setEditingCode("");
    setSavingId(null);
  };

  const saveCode = async (e, id) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const newCode = editingCode.trim();
    if (!newCode) {
      alert("Code is required");
      return;
    }

    // กันซ้ำในหน้าจอเดียวกัน
    const dup = mice.some(
      (m) => m._id !== id && (m.code || "").toLowerCase() === newCode.toLowerCase()
    );
    if (dup) {
      alert("This code already exists.");
      return;
    }

    const u = auth.currentUser;
    if (!u) {
      alert("Please log in");
      navigate("/login", { replace: true, state: { from: location } });
      return;
    }

    try {
      setSavingId(id);
      const idToken = await u.getIdToken(true);

      const res = await fetch(`${API_BASE}/${id}/recode`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ newCode }),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { message: text }; }

      if (!res.ok) {
        alert(data.message || "Update failed");
        return;
      }

      // อัปเดตบน state ให้เห็นผลทันที
      setMice((prev) =>
        prev.map((m) => (m._id === id ? { ...m, code: newCode } : m))
      );
      cancelEdit();
    } catch (err) {
      console.error("Recode error:", err);
      alert("Error updating code");
    } finally {
      setSavingId(null);
    }
  };

  const onEditKeyDown = (e, id) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      saveCode(e, id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit(e);
    }
  };

  const filtered = mice.filter((m) =>
    (m.code || "").toLowerCase().includes(search.toLowerCase())
  );

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
            <h3 style={{ margin: 0 }}>Mice Management</h3>

            <div className="search-wrap" style={{ margin: 0, minWidth: 340 }}>
              <input
                className="search-pill"
                placeholder="Search by code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
          </div>

          {/* Create button */}
          <button
            type="button"
            className="btn primary"
            style={{ height: 38, marginTop: 12 }}
            onClick={() => navigate("/create-mouse")}
          >
            Create Mouse
          </button>

          {/* Table */}
          <div style={{ marginTop: 16 }}>
            {loading ? (
              <p>Data Loading...</p>
            ) : error ? (
              <p style={{ color: "#ef4444" }}>{error}</p>
            ) : filtered.length === 0 ? (
              <p>Data not found</p>
            ) : (
              <table className="table">
                <tbody>
                  {filtered.map((mouse) => {
                    const isEditing = editingId === mouse._id;
                    const isSaving  = savingId === mouse._id;

                    return (
                      <tr key={mouse._id}>
                        <td style={{ width: 260 }}>
                          {isEditing ? (
                            <input
                              className="input"
                              autoFocus
                              value={editingCode}
                              onChange={(e) => setEditingCode(e.target.value)}
                              onKeyDown={(e) => onEditKeyDown(e, mouse._id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span>{mouse.code}</span>
                          )}
                        </td>

                        <td style={{ width: 160 }}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                className="btn primary"
                                style={{ height: 36 }}
                                disabled={isSaving}
                                onClick={(e) => saveCode(e, mouse._id)}
                              >
                                {isSaving ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ height: 36 }}
                                disabled={isSaving}
                                onClick={(e) => cancelEdit(e)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              style={{ height: 36, padding: "0 14px" }}
                              onClick={(e) => startEdit(e, mouse)}
                            >
                              Recode
                            </button>
                          )}
                        </td>

                        <td style={{ width: 160 }}>
                          <button
                            type="button"
                            className="btn"
                            style={{ height: 36, padding: "0 14px" }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(`/mouse/${mouse._id}`);
                            }}
                          >
                            Daily Record
                          </button>
                        </td>

                        <td style={{ width: 120 }}>
                          <button
                            type="button"
                            className="btn danger"
                            style={{ height: 36, padding: "0 14px" }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(mouse._id);
                            }}
                          >
                            Delete
                          </button>
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
