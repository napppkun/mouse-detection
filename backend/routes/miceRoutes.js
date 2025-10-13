import express from "express";
import { createMouse, getMice, getMouseById, deleteMouse, addDailyRecord, reCode } from "../controllers/miceController.js";
import { verifyFirebase } from "../middleware/verifyFirebase.js";

const router = express.Router();

router.get("/", verifyFirebase, getMice);
router.post("/create", verifyFirebase, createMouse);
router.get("/:id", verifyFirebase, getMouseById);
router.delete("/:id", verifyFirebase, deleteMouse);
router.post("/:id/daily-record", verifyFirebase, addDailyRecord);
router.patch("/:id/recode", verifyFirebase, reCode);

export default router;
