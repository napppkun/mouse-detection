import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { auth } from "../firebase";
import "../styles/auth.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const [oobCode, setOobCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // อ่าน oobCode จาก query
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("oobCode");

    if (!code) {
      setStatus("Invalid password reset link.");
      return;
    }

    setOobCode(code);

    // ตรวจว่า code ใช้ได้ไหม
    verifyPasswordResetCode(auth, code)
      .then(() => {
        setStatus("Please enter your new password.");
      })
      .catch(() => {
        setStatus("Reset link is invalid or expired.");
      });
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirm) {
      setStatus("Please fill all fields.");
      return;
    }

    if (password !== confirm) {
      setStatus("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      await confirmPasswordReset(auth, oobCode, password);

      setStatus("Password reset successful. Redirecting to login...");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);

    } catch (err) {
      console.error(err);
      setStatus("Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="form" onSubmit={handleSubmit}>

        <h2>Reset Password</h2>

        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="password"
            placeholder=" "
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <label className="user-label">New Password</label>
        </div>

        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="password"
            placeholder=" "
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={loading}
          />
          <label className="user-label">Confirm Password</label>
        </div>

        {status && (
          <p className="text-muted" style={{ color: "#2563eb" }}>
            {status}
          </p>
        )}

        <button className="button-submit" disabled={loading}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>

      </form>
    </div>
  );
}