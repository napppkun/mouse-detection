import Mice from "../models/miceModel.js";
// import Treatment from "../models/treatmentsModel.js";
import Group from "../models/groupModel.js";
import DailyRecord from "../models/dailyRecordModel.js";
import { dateOnlyUTC } from "../utils/dateOnly.js";

export const reCode = async (req, res) => {
  try {
    const { id } = req.params;

    // ดึงค่าจาก body ให้ถูกวิธี + trim กันช่องว่าง
    const newCode = (req.body?.newCode || "").trim();
    if (!newCode) {
      return res.status(400).json({ message: "Code is required" });
    }

    // auth จาก verifyFirebase (ต้องมี uid/email)
    const ownerUid = req.user?.uid;
    const ownerEmail = req.user?.email;
    if (!ownerUid) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    // ถ้า code เดิม = ใหม่อยู่แล้ว ก็จบ
    const current = await Mice.findOne({ _id: id, ownerUid });
    if (!current) return res.status(404).json({ message: "Mouse not found" });
    if (current.code === newCode) {
      return res.status(200).json({ message: "Code unchanged", mouse: current });
    }

    // กันซ้ำในเจ้าของเดียวกัน
    const exists = await Mice.exists({
      ownerUid,
      code: newCode,
      _id: { $ne: id },
    });
    if (exists) {
      return res.status(409).json({ message: "This code already exists" });
    }

    // อัปเดต code (อัปเดต ownerEmail ล่าสุดด้วยถ้าต้องการ)
    const updated = await Mice.findOneAndUpdate(
      { _id: id, ownerUid },
      { code: newCode, ownerEmail },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Mouse not found" });
    }

    return res.status(200).json({ message: "Mouse code updated successfully", mouse: updated });
  } catch (error) {
    // handle duplicate index
    if (error?.code === 11000) {
      return res.status(409).json({ message: "This code already exists" });
    }
    console.error("Error updating mouse code:", error);
    return res.status(500).json({ message: "Error updating mouse code" });
  }
};

export const createMouse = async (req, res) => {
  try {
    const { code, groupName } = req.body;
    const weight = parseFloat(req.body.weight);

    const ownerUid = req.user.uid;
    const ownerEmail = req.user.email;

    let group = await Group.findOne({ name: groupName, ownerUid });
    if (!group) {
      group = new Group({ name: groupName, ownerUid, ownerEmail });
      await group.save();
    }

    const submittedDate = dateOnlyUTC(req.body?.date);

    let volumeIntake = weight / 200;
    if (volumeIntake > 0.2) volumeIntake = 0.2;

    let existingMouse = await Mice.findOne({ code, ownerUid });

    if (existingMouse) {
      const exists = await DailyRecord.findOne({
        ownerUid,
        mouse: existingMouse._id,
        date: submittedDate,
      });
      if (exists) {
        return res
          .status(400)
          .json({ message: "Record for this date already exists" });
      }

      const newRecord = new DailyRecord({
        date: submittedDate,
        weight,
        group: group._id,
        volumeIntake,
        mouse: existingMouse._id,
        ownerUid,
        ownerEmail,
      });
      await newRecord.save();

      existingMouse.dailyRecord.push(newRecord._id);
      await existingMouse.save();

      return res
        .status(200)
        .json({ message: "Daily record added", mouse: existingMouse });
    }

    // ยังไม่มี mouse => สร้างใหม่
    const newMouse = new Mice({ code, ownerUid, ownerEmail });
    await newMouse.save();

    const newRecord = new DailyRecord({
      date: submittedDate,
      weight,
      group: group._id,
      volumeIntake,
      mouse: newMouse._id,
      ownerUid,
      ownerEmail,
    });
    await newRecord.save();

    newMouse.dailyRecord.push(newRecord._id);
    await newMouse.save();

    res.status(201).json({ message: "Mouse saved successfully!", mice: newMouse });
  } catch (error) {
    console.error("Error saving mouse:", error);
    res.status(500).json({ message: "Error saving mouse", error });
  }
};

export const getMice = async (req, res) => {
  try {
    const ownerUid = req.user.uid;
    const mice = await Mice.find({ ownerUid })
      .populate({ path: "dailyRecord", populate: { path: "group" } });
    res.status(200).json(mice);
  } catch (error) {
    res.status(500).json({ message: "Error fetching mice", error });
  }
};

export const getMouseById = async (req, res) => {
  try {
    const ownerUid = req.user.uid;
    const { id } = req.params;
    const mouse = await Mice.findOne({ _id: id, ownerUid }).populate({
      path: "dailyRecord",
      populate: { path: "group" },
    });
    if (!mouse) return res.status(404).json({ message: "Mouse not found" });
    res.status(200).json(mouse);
  } catch (error) {
    res.status(500).json({ message: "Error fetching mouse", error });
  }
};

export const deleteMouse = async (req, res) => {
  try {
    const ownerUid = req.user.uid;
    const { id } = req.params;

    const deletedMouse = await Mice.findOneAndDelete({ _id: id, ownerUid });
    if (!deletedMouse) return res.status(404).json({ message: "Mouse not found" });

    await DailyRecord.deleteMany({ ownerUid, mouse: id });

    res.status(200).json({ message: "Mouse deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting mouse", error });
  }
};

export const addDailyRecord = async (req, res) => {
  try {
    const mouseId = req.params.id;
    const { date, weight, groupName } = req.body;

    const ownerUid = req.user.uid;
    const ownerEmail = req.user.email;

    const submittedDate = dateOnlyUTC(req.body?.date);

    // mouse ต้องเป็นของเจ้าของคนนี้
    const mouse = await Mice.findOne({ _id: mouseId, ownerUid });
    if (!mouse) return res.status(404).json({ message: "Mouse not found" });

    // กันซ้ำ (วันเดียวกัน)
    const exists = await DailyRecord.findOne({
      ownerUid,
      mouse: mouse._id,
      date: submittedDate,
    });
    if (exists) {
      return res
        .status(400)
        .json({ message: "Record for this date already exists" });
    }

    // group per-owner
    let group = await Group.findOne({ name: groupName, ownerUid });
    if (!group) {
      group = new Group({ name: groupName, ownerUid, ownerEmail });
      await group.save();
    }

    let volumeIntake = weight / 200;
    if (volumeIntake > 0.2) volumeIntake = 0.2;

    const newRecord = new DailyRecord({
      date: submittedDate,
      weight,
      group: group._id,
      volumeIntake,
      mouse: mouse._id,

      ownerUid,
      ownerEmail,
    });
    await newRecord.save();

    mouse.dailyRecord.push(newRecord._id);
    await mouse.save();

    res.status(201).json({ message: "Daily record added", mouse });
  } catch (error) {
    console.error("Error adding daily record:", error);
    res.status(500).json({ message: "Error adding daily record", error });
  }
};
