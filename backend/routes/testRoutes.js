// routes/testRoutes.js
import express from "express";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import {
  getAllTests,
  getTestById,
  createTest,
  updateTest,
  deleteTest,
  // processTest,
  analyzeTest,
  analyzerWebhook,
  buildTestReport,
  getTestDownloads,
  downloadTestZip,
} from "../controllers/testController.js";

const router = express.Router();

// GET /api/tests
router.get("/", verifyFirebase, getAllTests);

// GET /api/tests/:id
router.get("/:id", verifyFirebase, getTestById);

// POST /api/tests
router.post("/", verifyFirebase, createTest);

// PUT /api/tests/:id
router.put("/:id", verifyFirebase, updateTest);

// DELETE /api/tests/:id
router.delete("/:id", verifyFirebase, deleteTest);

// POST /api/tests/:id/process → ยิงไปวิเคราะห์ทุกวิดีโอใน test
// router.post("/:id/process", verifyFirebase, processTest);

// POST /api/tests/:id/analyze → วิเคราะห์ test เดี่ยว (ถ้ามี video เดี่ยวๆ ให้วิเคราะห์)
router.post("/:id/analyze", verifyFirebase, analyzeTest);

router.post("/analyze/webhook", analyzerWebhook);

// API สำหรับรายงานผล test
router.post("/:id/report/build", verifyFirebase, buildTestReport);

// API สำหรับดาวน์โหลดผลลัพธ์ทั้ง test
router.get("/:id/downloads", verifyFirebase, getTestDownloads); // ดึงลิงก์ดาวน์โหลดไฟล์ทั้งหมด (ไม่รวมวิดีโอต้นฉบับ)
router.get("/:id/downloads/zip", verifyFirebase, downloadTestZip); // รวมเป็น ZIP แล้วสตรีมให้โหลด

export default router;
