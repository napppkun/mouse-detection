import User from "../models/userModel.js";

export const saveFirebaseUser = async (req, res) => {
  try {
    const { uid, email, provider, emailVerified } = req.user || {};
    if (!uid || !email) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const emailNorm = String(email).toLowerCase();

    let firstName = (req.body?.firstName || "").trim();
    let lastName = (req.body?.lastName || "").trim();

    if (!firstName && !lastName) {
      const displayName = (req.body?.displayName || "").trim();
      if (displayName) {
        const parts = displayName.split(/\s+/);
        firstName = parts.shift() || "";
        lastName = parts.join(" ") || "";
      }
    }

    const user = await User.findOneAndUpdate(
      { email: emailNorm },
      {
        $setOnInsert: {
          email: emailNorm,
          firstName,
          lastName,
          role: "user",
        },
        $set: {
          firebaseUid: uid,
          provider: provider || "",
          emailVerified: !!emailVerified,
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).select("-__v");

    return res.json({ message: "User synced", user });
  } catch (err) {
    console.error("[saveFirebaseUser] error:", err);
    return res.status(500).json({ message: "Internal error" });
  }
};