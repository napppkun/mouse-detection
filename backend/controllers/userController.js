// routes/userRoutes.js
import { Router } from "express";
import { saveFirebaseUser } from "../controllers/authController.js";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import User from "../models/userModel.js";

const router = Router();

router.post("/save-firebase-user", saveFirebaseUser);

/** สร้าง/ซิงก์เอกสารผู้ใช้เมื่อมี token ที่ผ่าน verify แล้ว
 * - ถ้ายังไม่มี => upsert ด้วย firstName/lastName ว่าง (ไม่ใช้ชื่อจาก Google)
 * - ถ้ามีแล้ว => อัปเดตแค่ฟิลด์ปลอดภัย (uid/provider/emailVerified)
 */
const ensureUser = async (req, res, next) => {
  try {
    const { uid, email, provider, emailVerified } = req.user || {};
    if (!uid || !email) return res.status(401).json({ message: "Unauthenticated" });

    const emailNorm = String(email).toLowerCase();

    await User.updateOne(
      { email: emailNorm },
      {
        $setOnInsert: {
          email: emailNorm,
          firebaseUid: uid,
          firstName: "",
          lastName: "",
          photoURL: "",
          provider: provider || "",
          emailVerified: !!emailVerified,
        },
        $set: {
          firebaseUid: uid,
          provider: provider || "",
          emailVerified: !!emailVerified,
        },
      },
      { upsert: true }
    );

    next();
  } catch (e) {
    console.error("[ensureUser]", e);
    res.status(500).json({ message: "Failed to ensure user" });
  }
};

router.get("/me", verifyFirebase, ensureUser, async (req, res) => {
  try {
    const emailNorm = String(req.user.email).toLowerCase();
    const user = await User.findOne({ email: emailNorm }).select("-__v");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching user data" });
  }
});

router.patch("/me", verifyFirebase, ensureUser, async (req, res) => {
  try {
    // รับเฉพาะฟิลด์ที่อนุญาต + trim + กัน undefined
    const updates = {};
    if (typeof req.body.firstName === "string") updates.firstName = req.body.firstName.trim();
    if (typeof req.body.lastName === "string") updates.lastName = req.body.lastName.trim();

    if (!("firstName" in updates) && !("lastName" in updates)) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const emailNorm = String(req.user.email).toLowerCase();
    const doc = await User.findOneAndUpdate(
      { email: emailNorm },
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-__v");

    if (!doc) return res.status(404).json({ message: "User not found" });
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Update failed" });
  }
});

export default router;
