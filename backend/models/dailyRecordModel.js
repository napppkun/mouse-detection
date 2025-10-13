import mongoose from "mongoose";

const dailyRecordSchema = new mongoose.Schema(
  {
    ownerUid:   { type: String, required: true, index: true },
    ownerEmail: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    weight: { type: Number, required: true },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    volumeIntake: { type: Number, required: true },
    mouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mice",
      required: true,
    },

  },
  { timestamps: true }
);

dailyRecordSchema.index({ ownerUid: 1, mouse: 1, date: 1 }, { unique: true });

const DailyRecord = mongoose.model("DailyRecord", dailyRecordSchema);
export default DailyRecord;
