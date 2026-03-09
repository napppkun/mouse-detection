// middleware/ensureUser.js
import admin from "../config/firebaseAdmin.js";
import User from "../models/userModel.js";

export const ensureUser = async (req, res, next) => {
  try {
    const { uid, email, provider, emailVerified } = req.user || {};
    if (!uid || !email) return res.status(401).json({ message: "Unauthenticated" });

    // มีอยู่แล้วก็อัปเดตค่า "ปลอดภัย" แล้วไปต่อ
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      await User.updateOne(
        { _id: existing._id },
        {
          $set: {
            firebaseUid: uid,
            provider: provider || existing.provider,
            emailVerified: typeof emailVerified === "boolean" ? !!emailVerified : existing.emailVerified,
          },
        }
      );
      return next();
    }

    // ยังไม่มีเอกสาร → สร้างใหม่
    let firstName = "";
    let lastName = "";

    try {
      const fbUser = await admin.auth().getUser(uid);
      const displayName = fbUser.displayName || "";

      const parts = displayName.trim().split(/\s+/);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ");
    } catch {
      // ถ้าดึงไม่ได้ ก็เก็บค่าว่างไว้
    }

    await User.create({
      email: email.toLowerCase(),
      firebaseUid: uid,
      firstName,
      lastName,
      provider: provider || "",
      emailVerified: !!emailVerified,
    });

    next();
  } catch (e) {
    console.error("[ensureUser]", e);
    next(e);
  }
};

export default ensureUser;