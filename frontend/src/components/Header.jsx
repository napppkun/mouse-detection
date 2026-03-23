import { Menu, UserCircle2, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useProgress } from "../context/ProgressCenter";

export default function Header({ onToggleSidebar }) {
  const navigate = useNavigate();
  const { signOutCleanup } = useProgress();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      try { signOutCleanup(); } catch {}  // ซ่อน progress tray ในทันที (สถานะยังคงเก็บใน localStorage ตาม uid เดิม)
      localStorage.removeItem("user");
      localStorage.removeItem("rememberEmail");
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="header">
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <button className="burger" onClick={onToggleSidebar}><Menu size={18}/></button>
        <div className="brand">
          <span className="logo">Mouse Analysis</span>
          <small>- system</small>
        </div>
      </div>
      <nav className="header-actions">
        <Link to="/profile" className="link-btn"><UserCircle2 size={18}/> Profile</Link>
        <button type="button" className="link-btn danger" onClick={handleLogout}>
          <LogOut size={18}/> Logout
        </button>
      </nav>
    </header>
  );
}
