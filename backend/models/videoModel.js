// models/videoModel.js
import mongoose from "mongoose";

const timeInZoneSchema = new mongoose.Schema(
  {
    zone: String,
    timeSeconds: Number,
    percentage: Number,
  },
  { _id: false }
);

const videoSchema = new mongoose.Schema(
  {
    // ===== file meta (GCS) =====
    originalName: { type: String, required: true, trim: true },
    filename: { type: String, required: true },
    path: { type: String, required: true }, // GCS URL (public/signed)
    gcsPath: { type: String, required: true }, // gs://... or object name
    size: { type: Number, required: true },
    mimetype: { type: String, required: true },
    duration: { type: Number }, // seconds

    // ===== relations =====
    mouseCode: { type: String, required: true, trim: true }, // MWM: ต้องตรงกับ Test.mouseCode
    dailyRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DailyRecord",
      required: true,
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      index: true,
    },

    // cache maze type ไว้ที่วิดีโอ เพื่อ validate เร็ว (sync จาก Test)
    mazeType: {
      type: String,
      enum: ["ElevatedPlusMaze", "Ymaze", "MorrisWaterMaze"],
    },

    // ===== trim (บังคับตามชนิดเมซ) =====
    trimStartSec: { type: Number, default: 0 },
    trimEndSec: { type: Number }, // EPM/Ymaze = 300, MWM = 60 (validated ด้านล่าง)

    // ===== MWM-only fields =====
    dayIndex: { type: Number, min: 1, max: 5 },
    releaseQuadrant: { type: String, enum: ["Q1", "Q2", "Q3", "Q4"] },
    targetQuadrant: { type: String, enum: ["Q1", "Q2", "Q3", "Q4"] },

    // ===== processing status & outputs =====
    status: {
      type: String,
      enum: ["uploaded", "processing", "processed", "failed"],
      default: "uploaded",
      index: true,
    },
    processedPath: String, // GCS URL
    processedGcsPath: String,
    excelPath: { type: String },
    excelGcsPath: { type: String },

    // ===== analysis results =====
    analysisResults: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Owner info
    ownerUid: { type: String, required: true, index: true },
    ownerEmail: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true, minimize: false }
);

// ---------- Indexes ----------
videoSchema.index({ ownerUid: 1, test: 1 });
videoSchema.index({ ownerUid: 1, mouseCode: 1 });
videoSchema.index({ status: 1 });
videoSchema.index({ test: 1, dayIndex: 1 });

// ---------- Middleware & Validation ----------
// ดึงชนิดเมซจาก Test มาใส่ mazeType และ enforce trimEndSec
videoSchema.pre("validate", async function (next) {
  try {
    if (!this.test) return next();

    const Test = mongoose.model("Test");
    const t = await Test.findById(this.test)
      .select("behaviorTest trimLimitSec mouseCode mwmPlan")
      .lean();

    if (!t) return next();

    // sync behaviorTest → mazeType
    this.mazeType = t.behaviorTest;

    // --- เตรียมค่าตัวเลขให้ชัดเจน ---
    let start = Number.isFinite(this.trimStartSec)
      ? Number(this.trimStartSec)
      : 0;
    let end = Number.isFinite(this.trimEndSec)
      ? Number(this.trimEndSec)
      : undefined;
    const dur = Number.isFinite(this.duration)
      ? Number(this.duration)
      : undefined;

    // เพดานระยะหน้าต่างสูงสุดตามชนิดเมซ (duration window)
    const limit = Number.isFinite(t.trimLimitSec)
      ? Number(t.trimLimitSec)
      : t.behaviorTest === "MorrisWaterMaze" || t.behaviorTest === "mwm"
      ? 60
      : 300;

    // ถ้ายังไม่ได้ตั้ง end → ตั้งเป็น start + min(limit, (dur-start) ถ้ามี)
    if (typeof end !== "number") {
      if (typeof dur === "number") {
        const remain = Math.max(0, dur - start);
        end = start + Math.min(limit, remain);
      } else {
        end = start + limit;
      }
    }

    // clamp start/end ให้อยู่ในขอบเขต
    if (!Number.isFinite(start) || start < 0) start = 0;

    // hardMax คือจบวิดีโอ (ไม่ใช่ limit ของ window)
    const hardMax = typeof dur === "number" ? Math.max(0, dur) : Infinity;
    if (!Number.isFinite(end) || end > hardMax) end = hardMax;

    // ถ้า start >= end → ปรับ end ให้มากกว่า start อย่างน้อย 1 วินาที
    if (end <= start) {
      // ถ้าไม่รู้ duration ให้ใช้หน้าต่าง 'limit' แทนการ fallback 1 วินาที
      if (typeof dur !== "number") {
        end = start + limit;
      } else {
        end = Math.min(hardMax, start + 1);
        // กรณีพิเศษ: ถ้า start เองก็เกินเพดาน/ระยะเวลา ให้ดัน start ถอยลง
        if (end <= start) {
          // ถ้ามี duration ให้ถอย start ลงมาให้อยู่ก่อนจบอย่างน้อย 1 วินาที
          if (typeof dur === "number" && dur > 1) {
            start = Math.max(0, hardMax - 1);
            end = hardMax;
          }
        }
      }
    }

    // จำกัดความยาวหน้าต่างไม่เกิน limit
    if (end - start > limit) {
      end = Math.min(end, start + limit, hardMax);
    }

    // เซ็ตกลับเข้า doc
    this.trimStartSec = start;
    this.trimEndSec = end;

    next();
  } catch (err) {
    next(err);
  }
});

const Video = mongoose.model("Video", videoSchema);
export default Video;
