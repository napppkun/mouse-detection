// routes/adminRoutes.js
import { Router } from "express";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { getAllUsers, grantAdmin } from "../controllers/adminController.js";

const router = Router();

router.get("/users", verifyFirebase, requireAdmin, getAllUsers);
router.post("/grant-admin", verifyFirebase, requireAdmin, grantAdmin);

export default router;