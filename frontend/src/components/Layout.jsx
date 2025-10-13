// 
import { Outlet } from "react-router-dom";
import { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import "../styles/app.css";
import "../styles/auth.css";  

export default function Layout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div>
        <Header onToggleSidebar={() => setOpen(v => !v)} />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}