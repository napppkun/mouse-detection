import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, provider } from "../firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  // sendEmailVerification,
} from "firebase/auth";
import "../styles/auth.css";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
const API = (BACKEND_URL.endsWith('/') ? BACKEND_URL : BACKEND_URL + '/') + 'api/users';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const remembered = localStorage.getItem("rememberEmail");
    if (remembered) {
      setEmail(remembered);
      setRemember(true);
    }
  }, []);

  const saveUserToDB = async (firebaseUser) => {
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch(`${API}/save-firebase-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
      }),
    });
    if (!res.ok) throw new Error(`Save user failed: ${res.status}`);
  };

  const mapFirebaseError = (code) => {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Invalid email or password.";
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      default:
        return "Something went wrong. Please try again.";
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // ยังไม่ verify → ส่งเมลยืนยัน + พาไปหน้า waiting
      // if (!cred.user.emailVerified) {
      //   await sendEmailVerification(cred.user, {
      //     url: `${window.location.origin}/auth/action?next=${encodeURIComponent("/home")}`,
      //     handleCodeInApp: false,
      //   });
      //   if (remember) localStorage.setItem("rememberEmail", email);
      //   else localStorage.removeItem("rememberEmail");

      //   // ไปหน้า AuthAction (pending) เพื่อรอการยืนยัน ไม่ปล่อยให้ไป Home
      //   navigate(`/auth/action?pending=1&next=${encodeURIComponent("/home")}`, { replace: true });
      //   return;
      // }

      // verify แล้ว → sync DB และเข้าระบบ
      await saveUserToDB(cred.user);
      if (remember) localStorage.setItem("rememberEmail", email);
      else localStorage.removeItem("rememberEmail");
      navigate("/home", { replace: true });
    } catch (err) {
      setStatus(mapFirebaseError(err?.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setStatus("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      await saveUserToDB(result.user);
      navigate("/home", { replace: true });
    } catch (err) {
      setStatus(mapFirebaseError(err?.code) || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  // const resendVerification = async () => {
  //   setStatus("");
  //   setLoading(true);
  //   try {
  //     // ถ้า sign-in อยู่แล้ว ใช้ currentUser เลย
  //     const user = auth.currentUser
  //       ? auth.currentUser
  //       : (await signInWithEmailAndPassword(auth, email, password)).user;

  //     if (user.emailVerified) {
  //       setStatus("Your email is already verified.");
  //     } else {
  //       await sendEmailVerification(user, {
  //         url: `${window.location.origin}/auth/action?next=${encodeURIComponent("/home")}`,
  //         handleCodeInApp: false,
  //       });
  //       setStatus("Verification email resent. Please check your inbox.");
  //       navigate(`/auth/action?pending=1&next=${encodeURIComponent("/home")}`, { replace: true });
  //     }
  //   } catch (err) {
  //     setStatus(mapFirebaseError(err?.code));
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  return (
    <div className="auth-screen">
      <form className="form" onSubmit={handleLogin}>

        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder=" "
            autoComplete="email"
            required
            disabled={loading}
          />
          <label className="user-label">Email</label>
        </div>

        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=" "
            autoComplete="current-password"
            required
            disabled={loading}
          />
          <label className="user-label">Password</label>
        </div>

        <div className="row-between" style={{ marginBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
            />
            Remember me
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        {status && <p className="text-muted" style={{ color: "#ef4444" }}>{status}</p>}

        <button className="button-submit" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        {/* ปุ่ม resend ใช้ได้ทั้งกรณีแสดงข้อความ หรือผู้ใช้กดเอง */}
        {/* <button type="button" className="auth-btn" onClick={resendVerification} disabled={loading}>
          Resend verification email
        </button> */}

        <p className="text-muted">
          Don't have an account? <Link to="/register">Sign Up</Link>
        </p>

        <div className="divider">Or With</div>
        <div className="social-grid one">
          <button type="button" className="auth-btn" onClick={handleGoogle} disabled={loading}>
            <img src="https://www.svgrepo.com/show/355037/google.svg" alt="Google" />
            Google
          </button>
        </div>
      </form>
    </div>
  );
}
