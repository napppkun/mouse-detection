// models/testModel.js
import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date },
    behaviorTest: {
      type: String,
      enum: ["ElevatedPlusMaze", "Ymaze", "MorrisWaterMaze"],
      required: true,
    },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],

    dailyRecords: [
      { type: mongoose.Schema.Types.ObjectId, ref: "DailyRecord" },
    ],
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
    template: { type: mongoose.Schema.Types.ObjectId, ref: "Template" },

    status: {
      type: String,
      enum: ["created", "configured", "processing", "completed", "failed"],
      default: "configured",
      index: true,
    },

    // boundingBoxes แบบรวม
    boundingBoxes: { type: Array, default: [] },

    // เก็บกล่อง “ต่อ mouseCode” (exact ที่ส่งจาก UI) ไม่ได้ใช้แล้ว
    // boundingBoxesByMouse: { type: mongoose.Schema.Types.Mixed, default: {} },

    settings: {
      fps: { type: Number, default: 30 },
      pixelToMeter: { type: Number, default: 100 },
      analysisStartTime: { type: Number, default: 0 },
    },

    trimLimitSec: { type: Number, default: 300 },

    resultExcelPath: { type: String },
    resultExcelGcsPath: { type: String },

    ownerUid: { type: String, required: true, index: true },
    ownerEmail: { type: String, required: true, index: true },

    // processing meta
    processingStartedAt: Date,
    processingCompletedAt: Date,
    processingError: String,
  },
  { timestamps: true }
);

const Test = mongoose.model("Test", testSchema);
export default Test;
