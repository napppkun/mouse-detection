import User from "../models/userModel.js";

export const getMe = async (req, res) => {
  try {
    const emailNorm = String(req.user.email).toLowerCase();

    const user = await User.findOne({ email: emailNorm }).select("-__v");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(user);
  } catch (e) {
    console.error("[getMe]", e);
    return res.status(500).json({ message: "Error fetching user data" });
  }
};

export const updateMe = async (req, res) => {
  try {
    const updates = {};

    if (typeof req.body.firstName === "string") {
      updates.firstName = req.body.firstName.trim();
    }
    if (typeof req.body.lastName === "string") {
      updates.lastName = req.body.lastName.trim();
    }

    if (!("firstName" in updates) && !("lastName" in updates)) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const emailNorm = String(req.user.email).toLowerCase();

    const doc = await User.findOneAndUpdate(
      { email: emailNorm },
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-__v");

    if (!doc) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(doc);
  } catch (e) {
    console.error("[updateMe]", e);
    return res.status(500).json({ message: "Update failed" });
  }
};