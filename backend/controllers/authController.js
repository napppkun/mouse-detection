// controllers/authController.js
import User from "../models/userModel.js";

// ฟังก์ชันนี้ถูกเรียกหลัง verifyFirebase แล้วเท่านั้น
export const saveFirebaseUser = async (req, res) => {
  try {
    const { uid, email, provider, emailVerified } = req.user || {};
    if (!uid || !email) return res.status(401).json({ message: "Unauthenticated" });

    const emailNorm = String(email).toLowerCase();

    // ชื่อครั้งแรก (ใช้เฉพาะตอน insert เท่านั้น จะไม่ทับค่าที่ผู้ใช้แก้ในภายหลัง)
    let firstName = "";
    let lastName  = "";
    const displayName = (req.body?.displayName || "").trim();
    if (displayName) {
      const parts = displayName.split(/\s+/);
      firstName = parts.shift() || "";
      lastName  = parts.join(" ") || "";
    }

    const photoURL = req.body?.photoURL || "";

    const user = await User.findOneAndUpdate(
      { email: emailNorm },
      {
        // เติมครั้งแรกเท่านั้น
        $setOnInsert: {
          email: emailNorm,
          firstName,
          lastName,
          role: "user",
        },
        // sync ทุกครั้ง
        $set: {
          firebaseUid: uid,
          provider: provider || "",
          emailVerified: !!emailVerified,
          photoURL,
        },
      },
      { new: true, upsert: true }
    ).select("-__v");

    return res.json({ message: "User synced", user });
  } catch (err) {
    console.error("[saveFirebaseUser] error:", err);
    return res.status(500).json({ message: "Internal error" });
  }
};
