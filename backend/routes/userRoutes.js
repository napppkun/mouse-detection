import { Router } from "express";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import ensureUser from "../middleware/ensureUser.js";
import { saveFirebaseUser } from "../controllers/authController.js";
import { getMe, updateMe } from "../controllers/userController.js";

const router = Router();

// sync user from Firebase after login
router.post("/save-firebase-user", verifyFirebase, saveFirebaseUser);

// profile routes
router.get("/me", verifyFirebase, ensureUser, getMe);
router.patch("/me", verifyFirebase, ensureUser, updateMe);

export default router;