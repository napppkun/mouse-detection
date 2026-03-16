// routes/videoRoutes.js
import express from "express";
import multer from "multer";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import {
  registerUploadedVideo,
  uploadVideo,
  createVideos,
  getVideosByTest,
  getVideo,
  updateVideo,
  deleteVideo,
  saveTrim,
  getVideoAnalysis,
  internalReport,
  getTrajectoryByVideo,
  recoverVideo
} from "../controllers/videoController.js";

const router = express.Router();

// Multer memory storage → ส่งขึ้น GCS
const storage = multer.memoryStorage();

// เฉพาะไฟล์วิดีโอ
const fileFilter = (req, file, cb) => {
  const allowed = [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
    "video/webm",
    "video/ogg",
    "video/3gpp",
    "video/x-flv",
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid file type. Only video files are allowed."), false);
};

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500MB
  fileFilter,
});

// ลงทะเบียนวิดีโอที่อัปโหลดขึ้น GCS แล้ว (signed URL flow)
router.post("/register", verifyFirebase, registerUploadedVideo);

// อัปโหลดวิดีโอเดี่ยว
// POST /api/videos  (field: "video")
router.post("/", verifyFirebase, upload.single("video"), uploadVideo);

// อัปโหลดหลายไฟล์ + จับคู่ mouse/dailyRecord
// POST /api/videos/bulk  (field: "videos")
router.post("/bulk", verifyFirebase, upload.array("videos"), createVideos);

// ดึงวิดีโอทั้งหมดของ test หนึ่งตัว
// GET /api/videos/test/:testId
router.get("/test/:testId", verifyFirebase, getVideosByTest);

// ดึงวิดีโอเดี่ยว
// GET /api/videos/:id
router.get("/:id", verifyFirebase, getVideo);

// อัปเดตวิดีโอ (trim, meta MWM, ผลวิเคราะห์ ฯลฯ)
// PUT /api/videos/:id
router.put("/:id", verifyFirebase, updateVideo);

// ลบวิดีโอ (พร้อมลบไฟล์ใน GCS และ unlink จาก Test.videos)
// DELETE /api/videos/:id
router.delete("/:id", verifyFirebase, deleteVideo);

// ผลการวิเคราะห์ของวิดีโอ
// GET /api/videos/:id/analysis
router.get("/:id/analysis", verifyFirebase, getVideoAnalysis);

// webhook ภายใน: ไม่ต้อง verifyFirebase ใช้ secret แทน
router.post("/internal/report", internalReport);

router.patch("/:id/trim", verifyFirebase, saveTrim);

router.get("/:id/trajectory", verifyFirebase, getTrajectoryByVideo);

router.post("/:id/recover", verifyFirebase, recoverVideo);

// Error handler ของ multer
router.use((err, req, res, next) => {
  if (err && err.message === "Invalid file type. Only video files are allowed.") {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "File too large. Maximum size is 500MB." });
  }
  next(err);
});

export default router;
