// routes/templateRoutes.js
import express from "express";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import { createTemplate, getTemplateByTest, updateTemplate } from "../controllers/templateController.js";

const router = express.Router();
router.post("/", verifyFirebase, createTemplate);                      // สร้าง
router.get("/by-test/:testId", verifyFirebase, getTemplateByTest);     // ดึงโดย testId
router.put("/:id", verifyFirebase, updateTemplate);                    // แก้ไข

export default router;
