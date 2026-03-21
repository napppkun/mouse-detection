// src/components/Layout.jsx
import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import Header from "./Header";
import Sidebar from "./Sidebar";
import "../styles/app.css";
import "../styles/auth.css";

const BACKEND_URL =
  window._env_?.BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "http://localhost:5000";

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;

        const idToken = await firebaseUser.getIdToken(true);

        const res = await fetch(`${BACKEND_URL}/api/users/me`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to load current user");
        }

        const data = await res.json();
        setCurrentUser(data);
      } catch (error) {
        console.error("load current user error:", error);
      }
    };

    loadMe();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        currentUser={currentUser}
      />
      <div>
        <Header onToggleSidebar={() => setOpen((v) => !v)} />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}