// src/pages/ManageTest.jsx
import React, { useState, useEffect, useRef } from "react";
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

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

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

  const fetchTests = async (idToken, opts = {}) => {
    setError("");
    const _page = opts.page ?? page;
    const _limit = opts.limit ?? limit;
    const _q = opts.q ?? search;

    try {
      const qs = new URLSearchParams({
        page: String(_page),
        limit: String(_limit),
        q: _q || "",
      });
      const res = await fetch(`${API_BASE}?${qs.toString()}`, {
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

      const js = await res.json();
      const rows = Array.isArray(js) ? js : js.data || [];
      setTests(rows);
      const pg = js.pagination || {};
      setPage(pg.currentPage || _page);
      setLimit(_limit);
      setTotal(pg.totalTests ?? rows.length);
      setTotalPages(pg.totalPages || 1);
    } catch (err) {
      console.error("Error fetching tests:", err);
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
      fetchTests(idToken, { page: 1 });
    });
    return unsub;
  }, [navigate, location]);

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
      const u2 = userRef.current; if (u2) {
        const token2 = await u2.getIdToken(false);
        setLoading(true);
        // รีเฟรชหน้าปัจจุบันก่อน
        await fetchTests(token2, { page });
        // ถ้าหน้าปัจจุบันว่างและมีหน้าก่อนหน้า ให้ถอยไปหน้าเดิม-1
        if (tests.length === 1 && page > 1) {
          setLoading(true);
          await fetchTests(token2, { page: page - 1 });
        }
      }
    } catch (err) {
      console.error("Error deleting test:", err);
      alert(err.message || "Error deleting test");
    }
  };

  // ทำ debounce เมื่อค้นหา แล้วรีเซ็ตไปหน้า 1
  useEffect(() => {
    const t = setTimeout(async () => {
      const u = userRef.current; if (!u) return;
      const idToken = await u.getIdToken(false);
      setLoading(true);
      fetchTests(idToken, { page: 1, q: search });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Polling ให้รีเฟรชหน้าเดียวปัจจุบัน
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!tests.length) return;

    if (isPendingAny(tests)) {
      pollRef.current = setInterval(async () => {
        const u = userRef.current; if (!u) return;
        const idToken = await u.getIdToken(false);
        fetchTests(idToken); // ใช้ page/limit/q ปัจจุบัน
      }, 4000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [tests, page, limit, search]);

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

  const rerunTest = async (test) => {
    try {
      const ok = window.confirm(
        "Re-run analysis for this test?\n- Pending/failed videos will be queued again.\n- Processed ones will be skipped by analyzer."
      );
      if (!ok) return;

      const u = auth.currentUser;
      if (!u) throw new Error("Please log in");
      const token = await u.getIdToken(false);

      // ยิงไปที่ analyze โดยไม่บังคับ strict (ให้ข้ามตัวที่ไม่มี box/templateได้)
      const resp = await fetch(`${API_BASE}/${test._id}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // ให้ backend เลือก videos ของ test เอง (โค้ดคุณทำอยู่แล้ว)
          // ใส่ strict: "0" เพื่อไม่บล็อกเคสบางไฟล์ไม่มีกล่อง/เทมเพลต
          strict: "0",
          // ใส่ค่า targetQuadrant ถ้าเป็น MWM (ใช้ตัวเดิมใน test หาก Frontend รู้)
          // targetQuadrant: "Q1", // (optional) ถ้ามีใน state ก็ส่งได้
        }),
      });
      const js = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(js?.message || "Failed to enqueue");

      alert(`Re-queued ${js?.data?.queued ?? 0} videos. The list will update shortly.`);
      // รีเฟรชหน้า
      const idToken = await u.getIdToken(false);
      setLoading(true);
      fetchTests(idToken, { page });
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to re-run test");
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

  const pageCount = Math.max(1, totalPages);

  const gotoPage = async (p) => {
    const clamped = Math.min(pageCount, Math.max(1, p));
    if (clamped === page) return;
    const u = userRef.current; if (!u) return;
    const idToken = await u.getIdToken(false);
    setLoading(true);
    fetchTests(idToken, { page: clamped });
  };

  const buildPages = () => {
    const pages = [];
    const add = (x) => pages.push(x);
    const show = new Set([1, page, page - 1, page + 1, pageCount]);
    for (let i = 1; i <= pageCount; i++) {
      if (show.has(i)) add(i);
      else if (pages[pages.length - 1] !== "...") add("...");
    }
    return pages;
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
            ) : tests.length === 0 ? (
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
                  {tests.map((t) => {
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

                            {/* Rerun Processing Test */}
                            <button
                              type="button"
                              className="btn"
                              style={{ height: 36, padding: "0 14px" }}
                              title="Re-run analysis for this test"
                              onClick={() => rerunTest(t)}
                            >
                              Re-run Test
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
                                Edit Test Name
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
            {pageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "space-between" }}>
                <div className="muted">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="btn" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>Prev</button>
                  {buildPages().map((p, i) =>
                    p === "..." ? (
                      <span key={i} className="muted" style={{ padding: "0 6px" }}>…</span>
                    ) : (
                      <button
                        key={i}
                        className="btn"
                        style={{ background: p === page ? "var(--brand)" : "#fff", color: p === page ? "#fff" : "inherit" }}
                        onClick={() => gotoPage(p)}
                      >{p}</button>
                    )
                  )}
                  <button className="btn" disabled={page >= pageCount} onClick={() => gotoPage(page + 1)}>Next</button>

                  <select
                    className="input"
                    value={limit}
                    onChange={async (e) => {
                      const newLimit = Number(e.target.value) || 10;
                      setLimit(newLimit);
                      const u = userRef.current; if (!u) return;
                      const idToken = await u.getIdToken(false);
                      setLoading(true);
                      fetchTests(idToken, { page: 1, limit: newLimit });
                    }}
                    style={{ width: 90, height: 36, marginLeft: 8 }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
