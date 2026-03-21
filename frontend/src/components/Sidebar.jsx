// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { Home, FlaskConical, Beaker, Users } from "lucide-react";

export default function Sidebar({ open, onClose, currentUser }) {
  const isAdmin = currentUser?.role === "admin";

  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? "show" : ""}`}
        onClick={onClose}
      />

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand" style={{ color: "#fff" }}>
          <span className="logo">LRD</span>
          <small></small>
        </div>

        <nav className="menu" onClick={onClose}>
          <NavLink to="/home">
            <Home size={18} /> Home
          </NavLink>

          <NavLink to="/manage-mice">
            <FlaskConical size={18} /> Mice
          </NavLink>

          <NavLink to="/manage-test">
            <Beaker size={18} /> Tests
          </NavLink>

          {isAdmin && (
            <NavLink to="/admin/users">
              <Users size={18} /> Users
            </NavLink>
          )}
        </nav>
      </aside>
    </>
  );
}