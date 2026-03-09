import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, provider } from "../firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  // sendEmailVerification,
  signInWithPopup,
} from "firebase/auth";
import "../styles/auth.css";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
const RAW = (BACKEND_URL.endsWith('/') ? BACKEND_URL : BACKEND_URL + '/') + 'api/users';
const API = RAW.endsWith("/users") ? RAW : `${RAW.replace(/\/$/, "")}/users`;

export default function Register() {
  const [user, setUser] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => setUser({ ...user, [e.target.name]: e.target.value });

  const saveUserToDB = async (firebaseUser, extra = {}) => {
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch(`${API}/save-firebase-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        ...extra,
      }),
    });
    if (!res.ok) throw new Error(`Save user failed: ${res.status}`);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus("");

    const { email, password, confirmPassword, firstName, lastName } = user;
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(cred.user, {
        displayName: `${firstName} ${lastName}`.trim(),
      });

      await saveUserToDB(cred.user, {
        firstName,
        lastName,
      });

      navigate("/home", { replace: true });
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Registration failed.");
    }
  };

  const handleGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      await saveUserToDB(result.user);
      navigate("/home");
    } catch (err) {
      setStatus("Google sign-in failed.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f3f4f6",
        padding: 24,
      }}
    >
      <form className="form" onSubmit={handleRegister}>

        {/* First Name */}
        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            name="firstName"
            value={user.firstName}
            onChange={handleChange}
            placeholder=" "
            autoComplete="given-name"
            required
          />
          <label className="user-label">First Name</label>
        </div>

        {/* Last Name */}
        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            name="lastName"
            value={user.lastName}
            onChange={handleChange}
            placeholder=" "
            autoComplete="family-name"
            required
          />
          <label className="user-label">Last Name</label>
        </div>

        {/* Email */}
        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="email"
            name="email"
            value={user.email}
            onChange={handleChange}
            placeholder=" "
            autoComplete="email"
            required
          />
          <label className="user-label">Email</label>
        </div>

        {/* Password */}
        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="password"
            name="password"
            value={user.password}
            onChange={handleChange}
            placeholder=" "
            autoComplete="new-password"
            required
          />
          <label className="user-label">Password</label>
        </div>

        <div className="input-group" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="password"
            name="confirmPassword"
            value={user.confirmPassword}
            onChange={handleChange}
            placeholder=" "
            autoComplete="new-password"
            required
          />
          <label className="user-label">Confirm Password</label>
        </div>

        {status && (
          <p className="p" style={{ color: status.includes("failed") ? "#ef4444" : "#2563eb" }}>
            {status}
          </p>
        )}

        <button className="button-submit" type="submit">Create account</button>

        <div className="p" style={{ marginTop: 12 }}>
          Already have an account?
          <Link to="/login" className="span"> Sign in</Link>
        </div>

        <button type="button" className="btn" onClick={handleGoogle} style={{ marginTop: 12 }}>
          <img
            src="https://www.svgrepo.com/show/355037/google.svg"
            alt="Google"
            width="20"
            height="20"
            style={{ marginRight: 8 }}
          />
          Continue with Google
        </button>
      </form>
    </div>
  );
}
