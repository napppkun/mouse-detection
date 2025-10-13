// middleware/verifyFirebase.js
import admin from "../config/firebaseAdmin.js";

export const verifyFirebase = async (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  // 1) อ่านจาก Authorization: Bearer
  const authHeader = req.headers.authorization || "";
  let idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  // 2) fallback: ?token=... (เช่น /api/files/proxy)
  if (!idToken && req.query && req.query.token) {
    idToken = String(req.query.token);
  }

  // 3) fallback: __session cookie (ถ้าเผื่อไว้ในอนาคต)
  if (!idToken && req.cookies && req.cookies.__session) {
    idToken = String(req.cookies.__session);
  }

  if (!idToken) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    // ตรวจความถูกต้องของ Firebase ID token
    const decoded = await admin.auth().verifyIdToken(idToken, true);

    const email = decoded.email || null;
    const provider = decoded.firebase?.sign_in_provider || "unknown";
    const emailVerified = !!decoded.email_verified;

    if (!email) {
      return res.status(400).json({ message: "Token has no email" });
    }
    if (provider === "password" && !emailVerified) {
      return res.status(403).json({ message: "Email not verified" });
    }

    // แนบเฉพาะฟิลด์ที่ระบบใช้จริง เพื่อเลี่ยง test fail
    req.user = {
      uid: decoded.uid,
      email,
      emailVerified,
      provider,
      role: decoded.role || null,
      ownerUid: decoded.ownerUid || decoded.uid,
      ownerEmail: decoded.ownerEmail || email,
      isAdmin: decoded.admin,
      claims: decoded,
    };

    return next();
  } catch (e) {
    console.error("[verifyFirebase] Invalid token:", e.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default verifyFirebase;
