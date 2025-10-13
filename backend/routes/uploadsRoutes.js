// routes/uploadsRoutes.js
import express from "express";
import { verifyFirebase } from "../middleware/verifyFirebase.js";
import { getSignedUploadUrl } from "../controllers/uploads.js";

const router = express.Router();

router.post("/sign", verifyFirebase, getSignedUploadUrl);

export default router;
