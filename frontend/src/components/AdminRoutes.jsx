// src/components/AdminRoutes.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "../firebase";

const BACKEND_URL =
  window._env_?.BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "http://localhost:5000";

export default function AdminRoutes({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          setIsAdmin(false);
          return;
        }

        const idToken = await firebaseUser.getIdToken(true);

        const res = await fetch(`${BACKEND_URL}/api/users/me`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!res.ok) {
          setIsAdmin(false);
          return;
        }

        const user = await res.json();
        setIsAdmin(user?.role === "admin");
      } catch (error) {
        console.error("AdminRoutes check error:", error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return children;
}