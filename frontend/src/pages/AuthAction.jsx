// src/pages/AuthAction.jsx
import { useEffect, useMemo, useState } from "react";
import { getAuth, checkActionCode, applyActionCode, sendEmailVerification } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import "../styles/auth.css";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function AuthAction() {
  const q = useQuery();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Processing…");
  const a = auth || getAuth();

  useEffect(() => {
    const mode = q.get("mode");
    const oobCode = q.get("oobCode");
    const next = q.get("next") || "/login";
    const pending = q.get("pending") === "1";

    // 1) กรณีจากอีเมล: verifyEmail + oobCode
    if (mode === "verifyEmail" && oobCode) {
      (async () => {
        try {
          setMsg("Verifying your email…");
          await checkActionCode(a, oobCode);
          await applyActionCode(a, oobCode);
          await a.currentUser?.reload?.();
          setMsg("Email verified. Redirecting…");
          navigate(next, { replace: true });
        } catch (e) {
          console.error(e);
          setMsg("Verification failed. Please try again or request a new link.");
          // กลับไป login ก็ได้
          // navigate("/login", { replace: true });
        }
      })();
      return;
    }

    // 2) กรณี pending รอผู้ใช้ไปกดยืนยันในอีเมล
    if (pending) {
      setMsg("We’ve sent a verification email. Please check your inbox…");

      const timer = setInterval(async () => {
        try {
          await a.currentUser?.reload?.();
          if (a.currentUser?.emailVerified) {
            setMsg("Email verified. Redirecting…");
            clearInterval(timer);
            navigate(next, { replace: true });
          }
        } catch {}
      }, 3000);

      return () => clearInterval(timer);
    }

    // กรณีไม่มีพารามิเตอร์ที่ต้องใช้
    navigate("/login", { replace: true });
  }, [q, a, navigate]);

  // ปุ่ม resend ให้ใช้ได้ทั้งใน pending และกรณี verify ล้มเหลว
  const resend = async () => {
    try {
      if (!a.currentUser) {
        setMsg("Please sign in first, then try again.");
        return;
        // หรือจะให้ผู้ใช้ใส่อีเมล/รหัสผ่านใหม่ที่หน้านี้ก็ได้ แต่โดยทั่วไปหลังสมัครเขายัง signed-in อยู่
      }
      if (a.currentUser.emailVerified) {
        setMsg("Your email is already verified.");
        return;
      }
      await sendEmailVerification(a.currentUser, {
        url: `${window.location.origin}/auth/action?next=${encodeURIComponent("/login")}`,
        handleCodeInApp: false,
      });
      setMsg("Verification email resent. Please check your inbox.");
    } catch (e) {
      console.error(e);
      setMsg("Failed to resend verification email.");
    }
  };

  return (
    <div className="auth-screen">
      <form className="form">
        <h2>Email verification</h2>
        <p className="p" style={{ color: "#2563eb" }}>{msg}</p>
        <button type="button" className="auth-btn" onClick={resend}>Resend verification email</button>
      </form>
    </div>
  );
}
