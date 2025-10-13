import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Navigate, useLocation } from "react-router-dom";

export default function AuthMiddleware({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return unsub;
  }, []);

  if (!ready) return null; // หรือ Loader
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}
