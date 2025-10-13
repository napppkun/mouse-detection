import mongoose from "mongoose";

const miceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    ownerUid:   { type: String, required: true, index: true },
    ownerEmail: { type: String, required: true, index: true, lowercase: true, trim: true },

    dailyRecord: [{ type: mongoose.Schema.Types.ObjectId, ref: "DailyRecord" }],
  },
  { timestamps: true }
);
//  compound index query with mulitple fields
miceSchema.index({ ownerUid: 1, code: 1}, { unique: true });

const Mice = mongoose.model("Mice", miceSchema);

export default Mice;
