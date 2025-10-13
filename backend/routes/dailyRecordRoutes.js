import express from "express";
import {
  deleteDailyRecord,
  updateDailyRecord,
  getRecordById,
  getAllRecords,
  getAvailableDates,
  getGroupsByDate,
  getMiceByDateAndGroup,
} from "../controllers/dailyRecordController.js";
import { verifyFirebase } from "../middleware/verifyFirebase.js";

const router = express.Router();

router.get("/dates", verifyFirebase, getAvailableDates);
router.get("/groups", verifyFirebase, getGroupsByDate);
router.get("/mice", verifyFirebase, getMiceByDateAndGroup);
router.delete("/:id", verifyFirebase, deleteDailyRecord);
router.put("/:id", verifyFirebase, updateDailyRecord);
router.get("/:id", verifyFirebase, getRecordById);
router.get("/", verifyFirebase, getAllRecords);

export default router;
