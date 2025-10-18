// models/templateModel.js
import mongoose from "mongoose";

const epmYRectSchema = new mongoose.Schema({
    type: { type: String, required: true },       // e.g., open_arm_1, A, B, C
    x: Number, y: Number, width: Number, height: Number, rotation: { type: Number, default: 0 },
}, { _id: false });

const mwmEllipseSchema = new mongoose.Schema({
    cx: Number, cy: Number, rx: Number, ry: Number, rotationDeg: { type: Number, default: 0 },
}, { _id: false });

const templateSchema = new mongoose.Schema({
    ownerUid: { type: String, required: true, index: true },
    ownerEmail: { type: String, required: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "Test", index: true },

    behaviorTest: { type: String, enum: ["ElevatedPlusMaze", "Ymaze", "MorrisWaterMaze"], required: true },

    // exactly one of:
    rectangles: { type: [epmYRectSchema], default: [] },   // สำหรับ EPM/Y
    ellipse: { type: mwmEllipseSchema, default: undefined }, // สำหรับ MWM

    sampleVideo: { type: String }, // (optional) videoId ของตัวอย่าง
}, { timestamps: true });

// ไม่ให้ซ้ำใน ownerUid+test
templateSchema.index({ ownerUid: 1, test: 1 }, { unique: true });

// บังคับโครง: EPM/Y ต้องมี rectangles (>0), MWM ต้องมี ellipse
templateSchema.pre("validate", function (next) {
    if (this.behaviorTest === "MorrisWaterMaze") {
        this.rectangles = []; // เคลียร์ให้ว่าง
        if (!this.ellipse || !Number.isFinite(this.ellipse?.cx) || !Number.isFinite(this.ellipse?.rx)) {
            return next(new Error("MWM template requires valid ellipse (cx,cy,rx,ry)"));
        }
    } else {
        this.ellipse = undefined;
        if (!Array.isArray(this.rectangles) || !this.rectangles.length) {
            return next(new Error("EPM/Y template requires rectangles"));
        }
    }
    next();
});

export default mongoose.model("Template", templateSchema);
