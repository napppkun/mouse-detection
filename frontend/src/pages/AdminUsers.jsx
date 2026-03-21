// src/pages/AdminUsers.jsx
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebase";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const BACKEND_URL =
  window._env_?.BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "http://localhost:5000";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyEmail, setBusyEmail] = useState("");

  async function fetchUsers() {
    const u = auth.currentUser;
    const token = await u.getIdToken(true);
    const res = await fetch(`${BACKEND_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Load users failed");
    setUsers(data.users || []);
  }

  useEffect(() => {
    fetchUsers().catch((e) => toast.error(e.message));
  }, []);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return users;
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(k) ||
        u.firstName?.toLowerCase().includes(k) ||
        u.lastName?.toLowerCase().includes(k)
    );
  }, [q, users]);

  async function grant(email, grant) {
    try {
      setBusy(true);
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch(`${BACKEND_URL}/api/admin/grant-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, grant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Update role failed");
      toast.success(grant ? "Granted admin" : "Revoked admin");
      await fetchUsers();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(email) {
    try {
      const confirmDelete = window.confirm(`Delete user ${email}?`);
      if (!confirmDelete) return;

      setBusyEmail(email);

      const token = await auth.currentUser.getIdToken(true);

      const res = await fetch(`${BACKEND_URL}/api/admin/delete-user`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Delete failed");

      toast.success("User deleted");
      await fetchUsers();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyEmail("");
    }
  }

  return (
    <div className="app-main" style={{ width: "100%" }}>
      <div className="main-wrap">
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Manage Users</h3>
            <div className="search-wrap" style={{ margin: 0, minWidth: 340 }}>
              <input className="search-pill" placeholder="Search by email, name" value={q} onChange={(e) => setQ(e.target.value)} />
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

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th style={{ width: 240 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u._id || u.firebaseUid || i}>
                    <td>{i + 1}</td>
                    <td>{u.email}</td>
                    <td>{[u.firstName, u.lastName].filter(Boolean).join(" ")}</td>
                    <td>
                      <span className={`chip ${u.role === "admin" ? "chip-ok" : ""}`}>{u.role}</span>
                    </td>
                    <td style={{ display: "flex", gap: 8 }}>
                      {u.role === "admin" ? (
                        <button
                          className="btn danger"
                          disabled={busy}
                          onClick={() => grant(u.email, false)}
                        >
                          Remove admin
                        </button>
                      ) : (
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() => grant(u.email, true)}
                        >
                          Make admin
                        </button>
                      )}
                      <button
                        className="btn danger"
                        disabled={busyEmail === u.email}
                        onClick={() => handleDelete(u.email)}
                      >
                        Delete user
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <ToastContainer position="top-right" />
    </div>
  );
}
