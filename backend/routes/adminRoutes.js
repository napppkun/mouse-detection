import { Router } from 'express';
import admin from '../config/firebaseAdmin.js';
import { verifyFirebase } from '../middleware/verifyFirebase.js';
import requireAdmin from '../middleware/requireAdmin.js';
import User from '../models/userModel.js';

const router = Router();

router.use(verifyFirebase, requireAdmin);
router.get("/users", async (_req, res) => {
    try {
        const users = await User.find({}, "-__v")
            .sort({ createdAt: -1 })
            .lean()
        res.json(users);
    } catch (e) {
        console.error("[admin/users] list error:", e);
        res.status(500).json({ ok: false, message: "Failed to fetch users" });
    }
});

router.post("/grant-admin", async (req, res) => {
    try{
        const { email, grant = true } = req.body || {};
        if (!email) return res.status(400).json({ ok: false, message: "Email is required" });

        const fbUser = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(fbUser.uid, { admin: !!grant });
        await admin.auth().revokeRefreshTokens(fbUser.uid);

        await User.findOneAndUpdate(
            { email: String(email).toLowerCase() },
            {
                $set: { 
                    firebaseUid: fbUser.uid,
                    role: grant ? "admin" : "user",
                    emailVerified: fbUser.emailVerified,
                    provider: (fbUser.providerData[0]?.providerId || "").replace(".com", ""),  
                },
                $setOnInsert: { 
                    firstName: "",
                    lastName: "",
                },
            },
            { new: true, upsert: true }
        );

        res.json({ ok: true });
    } catch(e) {
        console.error("[grant-admin] error:", e);
        res.status(400).json({ ok: false, message: e.message });
    }
});

router.patch("/user/:firebaseUid", async (req, res) => {
    try {
        const { firebaseUid } = req.params;
        const { role, disable } = req.body || {};

        const update = {};
        if (role) update.role = role;
        if (typeof disable === "boolean") update.disabled = disable;

        const doc = await User.findOneAndUpdate(
            { firebaseUid },
            { $set: update },
            { new: true }
        ).lean();

        if (!doc) return res.status(404).json({ ok: false, message: "User not found" });

        if (typeof disable === "boolean") {
            await admin.auth().updateUser(firebaseUid, { disable });
        }
        if (role) {
            await admin.auth().setCustomUserClaims(firebaseUid, { admin: role === "admin" });
            await admin.auth().revokeRefreshTokens(firebaseUid);
        }

        res.json({ ok: true, user: doc });
    } catch (e) {
        console.error("[admin/user PATCH] error:", e);
        res.status(400).json({ ok: false, message: "e.message" });
    }
});

export default router;