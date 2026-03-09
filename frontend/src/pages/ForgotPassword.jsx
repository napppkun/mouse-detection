import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import "../styles/auth.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const mapFirebaseError = (code) => {
    switch (code) {
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/user-not-found":
        return "No account found with this email.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      default:
        return "Unable to send reset email. Please try again.";
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/login`,
      });
      setStatus("Password reset email sent. Please check your inbox.");
    } catch (err) {
      setStatus(mapFirebaseError(err?.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="form" onSubmit={handleResetPassword}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Forgot Password</h2>

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

        {status && (
          <p
            className="text-muted"
            style={{
              color: status.toLowerCase().includes("sent") ? "#2563eb" : "#ef4444",
            }}
          >
            {status}
          </p>
        )}

        <button className="button-submit" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Email"}
        </button>

        <p className="text-muted" style={{ marginTop: 12 }}>
          Back to <Link to="/login">Sign In</Link>
        </p>
      </form>
    </div>
  );
}