// routes/progressRoutes.js
import express from "express";
import { stream, publish, dismiss } from "../services/progressHub.js";

const router = express.Router();

router.get("/stream", (req, res) => stream(req, res));

// ให้ main.py ส่งมา (ป้องกันด้วย secret)
router.post("/push", (req, res) => {
  const { secret } = req.body || {};
  if (secret !== process.env.PROGRESS_SECRET) return res.sendStatus(401);
  const { id, progress, status, stage, runId } = req.body;
  publish({ id, progress, status, stage, runId });
  res.json({ ok: true });
});

// ให้ UI เรียกเพื่อซ่อน progress bar ได้ทุกเมื่อ (รวมถึง failed)
router.post("/dismiss", (req, res) => {
  const { id, untilRunId } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: "id required" });
  dismiss(id, untilRunId);
  res.json({ ok: true });
});

export default router;
