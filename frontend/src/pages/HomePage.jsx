// src/pages/HomePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import "../styles/app.css";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
const API_BASE = (BACKEND_URL.endsWith('/') ? BACKEND_URL : BACKEND_URL + '/') + "api/mice";

export default function HomePage() {
  const [mice, setMice] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setError("Please log in");
        setMice([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError("");
        const idToken = await u.getIdToken(true);
        const res = await fetch(API_BASE, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setMice(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setError("Error fetching mice");
        setMice([]);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const normalize = (s) => (s || "").toString().toLowerCase();

  const latestGroupName = (mouse) => {
    const arr = Array.isArray(mouse.dailyRecord) ? mouse.dailyRecord : [];
    if (arr.length === 0) return "-";
    let latest = arr[0];
    for (const r of arr) {
      if (new Date(r.date) > new Date(latest.date)) latest = r;
    }
    return latest?.group?.name || "-";
  };

  const rows = useMemo(() => {
    const term = normalize(query);
    const list = mice
      .map((m) => ({
        _id: m._id,
        code: m.code || "",
        test: "-",
        group: latestGroupName(m),
      }))
      .filter(
        (r) =>
          !term ||
          normalize(r.code).includes(term) ||
          normalize(r.test).includes(term) ||
          normalize(r.group).includes(term)
      )
      .sort((a, b) => {
        const A = normalize(a.code);
        const B = normalize(b.code);
        if (A < B) return sortDir === "asc" ? -1 : 1;
        if (A > B) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    return list;
  }, [mice, query, sortDir]);

  const toggleSort = () => setSortDir((d) => (d === "asc" ? "desc" : "asc"));

  return (
    <div className="app-main">
      <div className="main-wrap">
        <div className="card">
          {/* หัวข้อ + Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
            {/* <h3 style={{ margin: 0 }}>My Test</h3> */}
  
            <div className="search-wrap" style={{ margin: 0, minWidth: 340 }}>
              <input
                className="search-pill"
                placeholder="Search by Code, Test, Group"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Search className="search-icon" />
            </div>
          </div>
  
          {/* ตาราง */}
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>
                  <button
                    onClick={toggleSort}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontWeight: 700,
                    }}
                    title={`Sort by Code (${sortDir})`}
                  >
                    Code {sortDir === "asc" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </th>
                <th>Test</th>
                <th>Group</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3}>Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={3} style={{ color: "var(--danger)" }}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3}>No data</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id}>
                    <td>{r.code}</td>
                    <td>{r.test}</td>
                    <td>{r.group}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}  