// controllers/adminController.js
import User from "../models/userModel.js";
import admin from "../config/firebaseAdmin.js";

export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({})
            .select("email firstName lastName role provider emailVerified firebaseUid createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return res.json({ users });
    } catch (e) {
        console.error("[getAllUsers]", e);
        return res.status(500).json({ message: "Load users failed" });
    }
};

export const grantAdmin = async (req, res) => {
    try {
        const { email, grant } = req.body || {};
        if (!email || typeof grant !== "boolean") {
            return res.status(400).json({ message: "Invalid payload" });
        }

        const emailNorm = String(email).toLowerCase();
        const user = await User.findOne({ email: emailNorm });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.role = grant ? "admin" : "user";
        await user.save();

        if (user.firebaseUid) {
            await admin.auth().setCustomUserClaims(user.firebaseUid, {
                admin: grant,
                role: user.role,
            });
        }

        return res.json({
            message: grant ? "Granted admin" : "Revoked admin",
            user,
        });
    } catch (e) {
        console.error("[grantAdmin]", e);
        return res.status(500).json({ message: "Update role failed" });
    }
};

export const deleteUser = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailNorm = String(email).toLowerCase();

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.email.toLowerCase() === emailNorm) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    if (user.firebaseUid) {
      try {
        await admin.auth().deleteUser(user.firebaseUid);
      } catch (e) {
        console.warn("Firebase delete failed:", e.message);
      }
    }

    await User.deleteOne({ _id: user._id });

    return res.json({ message: "User deleted successfully" });
  } catch (e) {
    console.error("[deleteUser]", e);
    return res.status(500).json({ message: "Delete failed" });
  }
};