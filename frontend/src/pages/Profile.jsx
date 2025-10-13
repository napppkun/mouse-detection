import { useEffect, useState } from "react";
import { auth } from "../firebase";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
const RAW = (BACKEND_URL.endsWith('/') ? BACKEND_URL : BACKEND_URL + '/') + 'api/users';
const API = RAW.endsWith("/users") ? RAW : `${RAW.replace(/\/$/,"")}/users`;

export default function Profile() {
  const [me, setMe] = useState(null);
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const u = auth.currentUser; if (!u) return;
        const token = await u.getIdToken(true);
        const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setMe(data);
        setFirst(data.firstName || "");
        setLast(data.lastName || "");
      } catch {
        setMsg("Failed to load user data");
      }
    };
    load();
  }, []);

  const updateProfile = async () => {
    try {
      setSaving(true); setMsg("");
      const u = auth.currentUser; if (!u) return;
      const token = await u.getIdToken(true);
      const res = await fetch(`${API}/me`, {
        method: "PATCH",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ firstName, lastName })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMe(data);
      setMsg("Profile updated successfully");
    } catch {
      setMsg("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 780, margin: "0 auto" }}>
      <h3>Account</h3>

      {/* Email (read only) */}
      <div className="form-row onecol">
        <div className="input-group">
          <input
            className="input"
            value={me?.email || ""}
            readOnly
            placeholder=" "
          />
          <label className="user-label">Email</label>
        </div>
      </div>

      {/* First Name */}
      <div className="form-row onecol">
        <div className="input-group">
          <input
            className="input"
            value={firstName}
            onChange={(e) => setFirst(e.target.value)}
            placeholder=" "
            required
          />
          <label className="user-label">First Name</label>
        </div>
      </div>

      {/* Surname */}
      <div className="form-row onecol">
        <div className="input-group">
          <input
            className="input"
            value={lastName}
            onChange={(e) => setLast(e.target.value)}
            placeholder=" "
            required
          />
          <label className="user-label">Surname</label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="btn primary" onClick={updateProfile} disabled={saving}>
          {saving ? "Saving..." : "Update Profile"}
        </button>
      </div>

      {msg && (
        <p style={{ marginTop: 12, color: msg.includes("successfully") ? "#16a34a" : "#ef4444" }}>
          {msg}
        </p>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />

      {/* <h3>Password</h3>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn">Send password reset email จะแก้ฟังก์ชันยังไม่เปลี่ยน</button>
        <button className="btn danger">Delete account</button>
      </div> */}
    </div>
  );
}
