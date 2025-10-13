// controllers/dailyRecordController.js
import DailyRecord from "../models/dailyRecordModel.js";
import Mice from "../models/miceModel.js";
// import Treatment from "../models/treatmentsModel.js";
import Group from "../models/groupModel.js";
import { dateOnlyUTC } from "../utils/dateOnly.js";
import mongoose from "mongoose";

if (typeof date !== "undefined") {
  dateOnly = dateOnlyUTC(date);
  const dup = await DailyRecord.findOne({
    ownerUid,
    mouse: record.mouse,
    date: dateOnly,
    _id: { $ne: id },
  });
  if (dup)
    res.status(400).json({ message: "Record for this date already exists" });
}

export const deleteDailyRecord = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;
    const { id } = req.params;

    const record = await DailyRecord.findOne({ _id: id, ownerUid });
    if (!record) return res.status(404).json({ message: "Record not found" });

    const mouseId = record.mouse;

    await DailyRecord.deleteOne({ _id: id, ownerUid });
    await Mice.updateOne(
      { _id: mouseId, ownerUid },
      { $pull: { dailyRecord: id } }
    );

    res.status(200).json({ message: "Daily record deleted successfully" });
  } catch (error) {
    console.error("Error deleting daily record:", error);
    res.status(500).json({ message: "Error deleting daily record", error });
  }
};

export const updateDailyRecord = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;
    const ownerEmail = req.user?.email;
    const { id } = req.params;

    const record = await DailyRecord.findOne({ _id: id, ownerUid });
    if (!record) return res.status(404).json({ message: "Record not found" });

    const { date, weight, groupName, volumeIntake } = req.body;

    // จัดการวันที่และกันซ้ำวันเดียวกันของหนูตัวเดิม (ยกเว้นตัวเอง)
    let dateOnly;
    if (typeof date !== "undefined") {
      dateOnly = dateOnlyUTC(date);
      const dup = await DailyRecord.findOne({
        ownerUid,
        mouse: record.mouse,
        date: dateOnly,
        _id: { $ne: id },
      });
      if (dup) {
        return res
          .status(400)
          .json({ message: "Record for this date already exists" });
      }
    }

    let groupRef = record.group;
    if (typeof groupName === "string" && groupName.trim()) {
      let g = await Group.findOne({ ownerUid, name: groupName.trim() });
      if (!g) {
        g = new Group({ ownerUid, ownerEmail, name: groupName.trim() });
        await g.save();
      }
      groupRef = g._id;
    }

    // สร้างเอกสารอัปเดต
    const updateDoc = {};
    if (typeof weight !== "undefined") updateDoc.weight = weight;
    if (typeof volumeIntake !== "undefined") {
      updateDoc.volumeIntake = volumeIntake;
    } else if (typeof weight !== "undefined") {
      // ถ้าไม่ส่ง volumeIntake มา แต่เปลี่ยนน้ำหนัก → คำนวนให้
      const vi = Math.min(Number(weight) / 200, 0.2);
      updateDoc.volumeIntake = Number.isFinite(vi) ? vi : record.volumeIntake;
    }
    if (dateOnly) updateDoc.date = dateOnly;
    if (groupRef) updateDoc.group = groupRef;

    const updated = await DailyRecord.findOneAndUpdate(
      { _id: id, ownerUid },
      updateDoc,
      { new: true }
    ).populate("group mouse");

    if (!updated) return res.status(404).json({ message: "Record not found" });
    res.status(200).json({ message: "Record updated", record: updated });
  } catch (error) {
    console.error("Error updating record:", error);
    res.status(500).json({ message: "Error updating record", error });
  }
};

export const getRecordById = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;
    const record = await DailyRecord.findOne({
      _id: req.params.id,
      ownerUid,
    }).populate("group mouse");
    if (!record) return res.status(404).json({ message: "Record not found" });
    res.status(200).json(record);
  } catch (error) {
    console.error("Error fetching record:", error);
    res.status(500).json({ message: "Error fetching record", error });
  }
};

export const getAllRecords = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;
    const { mouse } = req.query;

    const filter = { ownerUid };
    if (mouse) filter.mouse = mouse;

    const records = await DailyRecord.find(filter).populate("mouse group");
    res.status(200).json(records);
  } catch (error) {
    console.error("Error fetching records:", error);
    res.status(500).json({ message: "Error fetching records", error });
  }
};

// get distinct dates
export const getAvailableDates = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;

    // Use MongoDB's distinct() which automatically removes duplicates
    const dates = await DailyRecord.distinct("date", { ownerUid });

    // Sort dates in descending order (newest first)
    const sortedDates = dates.sort((a, b) => new Date(b) - new Date(a));

    res.json(sortedDates);
  } catch (error) {
    console.error("Error fetching dates:", error);
    res.status(500).json({ message: "Error fetching dates" });
  }
};

// get groups by date
export const getGroupsByDate = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;
    const { date } = req.query;

    if (!date) return res.status(400).json({ message: "date is required" });

    // 🔧 แปลงให้เป็น "เที่ยงคืน UTC" เพื่อเทียบกับค่าใน DB ได้ตรง
    const dateInput = typeof date === "string" ? date.slice(0, 10) : date;
    const dateOnly = dateOnlyUTC(dateInput);
    if (isNaN(dateOnly.valueOf())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const records = await DailyRecord.find({
      ownerUid,
      date: dateOnly,
    }).populate("group");

    const groups = records.map((r) => r.group).filter(Boolean);

    // Remove duplicates by _id
    const unique = [];
    const seen = new Set();
    for (const g of groups) {
      if (!seen.has(g._id.toString())) {
        unique.push({ _id: g._id, name: g.name });
        seen.add(g._id.toString());
      }
    }

    res.status(200).json(unique);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ message: "Error fetching groups", error });
  }
};

// get mice by date + group
export const getMiceByDateAndGroup = async (req, res) => {
  try {
    const ownerUid = req.user?.ownerUid || req.user?.uid;
    let { date, group } = req.query;

    if (!ownerUid) return res.status(401).json({ message: "Unauthorized" });
    if (!date || !group) {
      return res.status(400).json({ message: "date and group are required" });
    }

    // --- แปลง date ให้เป็นเที่ยงคืน UTC แบบปลอดภัย ---
    // รองรับทั้ง "2025-08-20", "2025-08-20T00:00:00.000Z", และ Date
    const dateInput =
      typeof date === "string"
        ? date.slice(0, 10) // ตัดให้เหลือ YYYY-MM-DD
        : date;
    const dateOnly = dateOnlyUTC(dateInput);
    if (isNaN(dateOnly.valueOf())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    // --- แปลง group เป็น ObjectId หรือ resolve จากชื่อ ---
    let groupId = group;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      const gDoc = await Group.findOne({
        ownerUid,
        name: String(group).trim(),
      }).select("_id");
      if (!gDoc) return res.status(404).json({ message: "Group not found" });
      groupId = gDoc._id;
    }

    const records = await DailyRecord.find({
      ownerUid,
      date: dateOnly,
      group: groupId,
    })
      .populate("mouse", "code name")
      .select("_id mouse");

    const miceRaw = records
      .filter((r) => !!r.mouse)
      .map((r) => ({
        _id: r.mouse._id,
        code: r.mouse.code,
        name: r.mouse.name,
        dailyRecordId: r._id, // ใช้ตอนอัปโหลดวิดีโอ
      }));

    // unique ตาม code
    const seen = new Set();
    const mice = [];
    for (const m of miceRaw) {
      if (!seen.has(m.code)) {
        mice.push(m);
        seen.add(m.code);
      }
    }

    return res.status(200).json(mice);
  } catch (error) {
    console.error("Error fetching mice:", error);
    return res.status(500).json({ message: "Error fetching mice" });
  }
};
