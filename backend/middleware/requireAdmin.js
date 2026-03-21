// middleware/requireAdmin.js
import User from "../models/userModel.js";

export const requireAdmin = async (req, res, next) => {
  try {
    const email = String(req.user?.email || "").toLowerCase();
    if (!email) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const user = await User.findOne({ email }).select("role").lean();
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    next();
  } catch (e) {
    console.error("[requireAdmin]", e);
    return res.status(500).json({ message: "Authorization failed" });
  }
};