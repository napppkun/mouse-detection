// models/groupModel.js
import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    ownerUid: { type: String, required: true, index: true },
    ownerEmail: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "groups" } // ใช้คอลเลกชันใหม่ชื่อ groups
);

// กลุ่มหนึ่งชื่อซ้ำไม่ได้ใน owner เดียวกัน
groupSchema.index({ ownerUid: 1, name: 1 }, { unique: true });

const Group = mongoose.model("Group", groupSchema);
export default Group;
