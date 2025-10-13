// routes/progressRoutes.js
import express from "express";
import { stream, publish } from "../services/progressHub.js";

const router = express.Router();

router.get("/stream", (req, res) => stream(req, res));

// ให้ main.py ส่งมา (ป้องกันด้วย secret)
router.post("/push", (req, res) => {
  const { secret } = req.body || {};
  if (secret !== process.env.PROGRESS_SECRET) return res.sendStatus(401);
  const { id, progress, status, stage } = req.body;
  publish({ id, progress, status, stage });
  res.json({ ok: true });
});

export default router;
