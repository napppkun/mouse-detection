// models/resultModel.js
import mongoose from "mongoose";

const base = {
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Test",
    index: true,
    required: true,
  },
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Video",
    unique: true,
    required: true,
  },
  mouseCode: { type: String, index: true },
  mazeType: {
    type: String,
    enum: ["epm", "ymaze", "mwm"],
    index: true,
    required: true,
  },
  ownerUid: { type: String, index: true, required: true },
  ownerEmail: { type: String, index: true, required: true },

  // ช่วยทำรายงานง่ายและคงค่าถึงแม้ test จะถูกแก้ชื่อภายหลัง
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
  groupName: { type: String }, // อัปเดตตอน upsert ผล
};

const ResultSchema = new mongoose.Schema(base, {
  timestamps: true,
  discriminatorKey: "mazeType",
});
ResultSchema.index({ test: 1, video: 1 }, { unique: true });

export const Result = mongoose.model("Result", ResultSchema);

// ---- EPM ----
const EpmResultSchema = new mongoose.Schema({
  epm: {
    open_arm_1: Number,
    open_arm_2: Number,
    closed_arm_1: Number,
    closed_arm_2: Number,
    avg_open_arm: Number,
    avg_closed_arm: Number,
    absolute_diff: Number,
  },
});
export const EpmResult = Result.discriminator("epm", EpmResultSchema);

// ---- Y-maze ----
const YMazeResultSchema = new mongoose.Schema({
  ymaze: {
    sequence: [
      { entry: Number, arm: String, alternation: mongoose.Schema.Types.Mixed },
    ],
    summary: {
      A_entries: Number,
      B_entries: Number,
      C_entries: Number,
      total_entries: Number,
      no_of_alternation: Number,
      alternation_percent: Number,
      time_A: Number,
      time_B: Number,
      time_C: Number,
    },
  },
});
export const YMazeResult = Result.discriminator("ymaze", YMazeResultSchema);

// ---- MWM ----
const MWMResultSchema = new mongoose.Schema({
  mwm: {
    // sheet quadrants
    quadrants: {
      Q1: Number,
      Q2: Number,
      Q3: Number,
      Q4: Number,
    },
    // sheet summary
    summary: {
      targetQuadrant: { type: String, enum: ["Q1", "Q2", "Q3", "Q4"] },
      avg_in_target: Number,
    },
  },
});
export const MWMResult = Result.discriminator("mwm", MWMResultSchema);
