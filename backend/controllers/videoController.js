// controllers/videoController.js
import path from "path";
// import { v4 as uuidv4 } from "uuid";
import { uploadFileToGCS } from "../services/gcsUploader.js";
import DailyRecord from "../models/dailyRecordModel.js";
import Video from "../models/videoModel.js";
import Test from "../models/testModel.js";
import {
  Result,
  EpmResult,
  YMazeResult,
  MWMResult,
} from "../models/resultModel.js";
import axios from "axios";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_KEY),
});
const bucketName = process.env.GOOGLE_CLOUD_BUCKET;

const ANALYSIS_API = process.env.ANALYSIS_API || "http://localhost:8000";
const PROGRESS_SECRET = process.env.PROGRESS_SECRET;

export async function registerUploadedVideo(req, res) {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const ownerEmail = req.user.ownerEmail || req.user.email;

    const {
      objectPath,        // "videos/<uid>/<uuid>-<ts>.mp4"
      originalName,
      mimetype,
      size,
      mouseCode,
      dailyRecordId,
      testId,
      durationSec,
    } = req.body || {};

    if (!objectPath || !originalName || !mimetype || !size || !mouseCode || !dailyRecordId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // verify daily record
    const dr = await DailyRecord.findOne({ _id: dailyRecordId, ownerUid });
    if (!dr) return res.status(404).json({ success: false, message: "DailyRecord not found" });

    // สร้าง URL สำหรับอ่าน (signed ชั่วคราว) หรือใช้ public URL ถ้าบัคเก็ต public
    const file = storage.bucket(bucketName).file(objectPath);
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;

    // ถ้าบัคเก็ตไม่ public และอยากได้ลิงก์อ่านได้ทันที ให้เซ็น URL อ่าน
    // const [signedUrl] = await file.getSignedUrl({
    //   action: "read",
    //   expires: Date.now() + 24 * 60 * 60 * 1000,
    // });

    const video = await Video.create({
      originalName,
      filename: objectPath.split("/").pop(),
      path: publicUrl,           // หรือ signedUrl
      gcsPath: objectPath,
      size,
      mimetype,
      // เก็บเป็น duration ของไฟล์ต้นฉบับ
      duration: Number.isFinite(Number(durationSec)) ? Number(durationSec) : undefined,
      durationOriginalSec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : undefined,
      durationSource: Number.isFinite(Number(durationSec)) ? "original" : "unknown",
      mouseCode,
      dailyRecord: dr._id,
      test: testId || undefined,
      ownerUid,
      ownerEmail,
    });

    if (testId) {
      await Test.findOneAndUpdate(
        { _id: testId, ownerUid },
        { $addToSet: { videos: video._id } },
        { new: true }
      );
    }

    return res.status(201).json({ success: true, data: video });
  } catch (e) {
    console.error("registerUploadedVideo error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
}

// อัปโหลดวิดีโอเดี่ยว
export const uploadVideo = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No video file uploaded" });

    const ownerUid = req.user.ownerUid || req.user.uid;
    const ownerEmail = req.user.ownerEmail || req.user.email;

    // ตั้งชื่อไฟล์ใน GCS
    const ext = path.extname(req.file.originalname);
    const uniqueFilename = `videos/${ownerUid}/${uuidv4()}-${Date.now()}${ext}`;

    const gcsUrl = await uploadFileToGCS({
      ...req.file,
      originalname: uniqueFilename,
    });

    const {
      mouseCode,
      dailyRecordId,
      testId,
      dayIndex, // MWM
      releaseQuadrant, // MWM
      targetQuadrant, // MWM
      durationSec,
    } = req.body;

    // verify daily record
    const dr = await DailyRecord.findOne({ _id: dailyRecordId, ownerUid });
    if (!dr)
      return res
        .status(404)
        .json({ success: false, message: "DailyRecord not found" });

    const video = await Video.create({
      originalName: req.file.originalname,
      filename: uniqueFilename,
      path: gcsUrl,
      gcsPath: uniqueFilename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      duration: Number.isFinite(Number(durationSec)) ? Number(durationSec) : undefined,
      durationOriginalSec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : undefined,
      durationSource: Number.isFinite(Number(durationSec)) ? "original" : "unknown",
      mouseCode,
      dailyRecord: dr._id,
      test: testId || undefined,
      dayIndex: dayIndex ? Number(dayIndex) : undefined,
      releaseQuadrant: releaseQuadrant || undefined,
      targetQuadrant: targetQuadrant || undefined,
      ownerUid,
      ownerEmail,
    });

    // ถ้ามี testId ให้ push video เข้า Test.videos ด้วย
    if (testId) {
      await Test.findOneAndUpdate(
        { _id: testId, ownerUid },
        { $addToSet: { videos: video._id } },
        { new: true }
      );
    }

    res.status(201).json({ success: true, data: video });
  } catch (error) {
    console.error("Error uploading video:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// สร้างหลายวิดีโอ (จับคู่ mouseCode/dailyRecord) — ใช้ตอนอัปโหลดหลายไฟล์
export const createVideos = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const ownerEmail = req.user.ownerEmail || req.user.email;

    const { videoPairs = [], testId } = req.body; // [{mouseCode,dailyRecordId, dayIndex?, releaseQuadrant?, targetQuadrant?}, ...]
    if (!req.files?.length) {
      return res
        .status(400)
        .json({ success: false, message: "No video files uploaded" });
    }
    if (videoPairs.length !== req.files.length) {
      return res.status(400).json({
        success: false,
        message: "videoPairs count must match files count",
      });
    }

    const created = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const meta = videoPairs[i];

      const dr = await DailyRecord.findOne({
        _id: meta.dailyRecordId,
        ownerUid,
      }).populate("mouse");
      if (!dr) {
        return res.status(404).json({
          success: false,
          message: `DailyRecord not found for mouse ${meta.mouseCode}`,
        });
      }
      if (dr.mouse?.code !== meta.mouseCode) {
        return res.status(400).json({
          success: false,
          message: `Mouse code mismatch for ${meta.mouseCode}`,
        });
      }

      const ext = path.extname(file.originalname);
      const uniqueFilename = `videos/${ownerUid}/${uuidv4()}-${Date.now()}${ext}`;
      const gcsUrl = await uploadFileToGCS({
        ...file,
        originalname: uniqueFilename,
      });

      const v = await Video.create({
        originalName: file.originalname,
        filename: uniqueFilename,
        path: gcsUrl,
        gcsPath: uniqueFilename,
        size: file.size,
        mimetype: file.mimetype,
        mouseCode: meta.mouseCode,
        dailyRecord: dr._id,
        test: testId || undefined,
        dayIndex: meta.dayIndex ? Number(meta.dayIndex) : undefined,
        releaseQuadrant: meta.releaseQuadrant || undefined,
        targetQuadrant: meta.targetQuadrant || undefined,
        ownerUid,
        ownerEmail,
      });

      created.push(v);
    }

    // ผูกเข้ากับ Test (ถ้าระบุมา)
    if (testId) {
      await Test.findOneAndUpdate(
        { _id: testId, ownerUid },
        { $addToSet: { videos: { $each: created.map((v) => v._id) } } },
        { new: true }
      );
    }

    res.status(201).json({ success: true, videos: created });
  } catch (error) {
    console.error("Error creating videos:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// query videos in a test
export const getVideosByTest = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { testId } = req.params;

    const videos = await Video.find({ ownerUid, test: testId }).populate(
      "dailyRecord"
    );
    res.json({ success: true, data: videos });
  } catch (error) {
    console.error("getVideosByTest error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// get single video
export const getVideo = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const video = await Video.findOne({
      _id: req.params.id,
      ownerUid,
    }).populate("dailyRecord");
    if (!video)
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });
    res.json({ success: true, data: video });
  } catch (error) {
    console.error("getVideo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// update video (analysis results / trim / mwm meta)
export const updateVideo = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const updates = req.body;

    // guard บางฟิลด์ไม่ให้แก้เองถ้าไม่จำเป็น
    const allowed = [
      "status",
      "processedPath",
      "processedGcsPath",
      "excelPath",
      "excelGcsPath",
      "analysisResults",
      "trimStartSec",
      "trimEndSec",
      "dayIndex",
      "releaseQuadrant",
      "targetQuadrant",
      "test",
    ];
    const patch = {};
    for (const k of allowed)
      if (updates[k] !== undefined) patch[k] = updates[k];

    const video = await Video.findOneAndUpdate(
      { _id: req.params.id, ownerUid },
      patch,
      { new: true, runValidators: true }
    );
    if (!video)
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });

    // ถ้ามีการผูก test ใหม่ ให้ push เข้าท้าย Test.videos
    if (patch.test) {
      await Test.findOneAndUpdate(
        { _id: patch.test, ownerUid },
        { $addToSet: { videos: video._id } }
      );
    }

    res.json({ success: true, data: video });
  } catch (error) {
    console.error("updateVideo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// delete video + ลบออกจาก Test.videos
export const deleteVideo = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const video = await Video.findOne({ _id: req.params.id, ownerUid });
    if (!video)
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });

    // ดึงจาก GCS (ลบไฟล์จริง) — ถ้า service คุณรองรับลบผ่าน gcsUploader ก็ใช้ตรงนั้น
    try {
      // สมมติ uploadFileToGCS มี util deleteFileFromGCS(gcsPath)
      const { deleteFileFromGCS } = await import("../services/gcsUploader.js");
      if (video.gcsPath) await deleteFileFromGCS(video.gcsPath);
      if (video.processedGcsPath)
        await deleteFileFromGCS(video.processedGcsPath);
      if (video.excelGcsPath) await deleteFileFromGCS(video.excelGcsPath);
    } catch (gcsErr) {
      console.error("GCS delete error:", gcsErr.message);
    }

    // ลบออกจาก Test.videos
    if (video.test) {
      await Test.findOneAndUpdate(
        { _id: video.test, ownerUid },
        { $pull: { videos: video._id } }
      );
    }

    await Video.deleteOne({ _id: video._id });
    res.json({ success: true, message: "Video deleted" });
  } catch (error) {
    console.error("deleteVideo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// analysis results of a video
export const getVideoAnalysis = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const video = await Video.findOne({
      _id: req.params.id,
      ownerUid,
      status: "processed",
    }).select("analysisResults originalName mouseCode");
    if (!video)
      return res
        .status(404)
        .json({ success: false, message: "Video analysis not found" });
    res.json({ success: true, data: video.analysisResults });
  } catch (error) {
    console.error("getVideoAnalysis error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// internal API: รับรายงานผลการประมวลผลจาก analysis_service (ผ่าน secret)
export const internalReport = async (req, res) => {
  try {
    const { secret, id, status, resultUrls, metrics } = req.body || {};
    if (secret !== process.env.PROGRESS_SECRET)
      return res.status(403).json({ ok: false });
    if (!id || !status)
      return res.status(400).json({ ok: false, message: "bad payload" });

    // อัปเดตเอกสาร Video (ตามที่คุณทำอยู่)
    const patch = {};
    if (status === "processed") {
      patch.status = "processed";
      patch.processedPath = resultUrls?.processedVideo || undefined;
      patch.excelPath = resultUrls?.excelFile || undefined;
      patch.analysisResults = metrics || undefined;
    } else if (status === "failed") {
      patch.status = "failed";
    }

    // ถ้า metrics ใน payload ว่าง → ลองอ่านจาก Result แล้ว backfill ใส่ Video.analysisResults
    let metricsObj = req.body?.metrics;
    if (!metricsObj || !Object.keys(metricsObj || {}).length) {
      try {
        const rdoc = await Result.findOne({ video: id })
          .select("epm ymaze mwm")
          .lean();
        if (rdoc?.epm) metricsObj = { epm: rdoc.epm };
        else if (rdoc?.ymaze) metricsObj = { ymaze: rdoc.ymaze };
        else if (rdoc?.mwm) metricsObj = { mwm: rdoc.mwm };
      } catch (e) {
        console.warn("lookup Result failed:", e?.message || e);
      }
    }
    if (metricsObj && Object.keys(metricsObj).length) {
      patch.analysisResults = metricsObj;
    }

    console.log("internalReport.metrics keys:", Object.keys(metricsObj || {}));
    await Video.updateOne({ _id: id }, { $set: patch });
    const vcheck = await Video.findById(id).select(
      "processedPath excelPath analysisResults"
    );
    console.log(
      "saved video fields:",
      vcheck?.processedPath,
      vcheck?.excelPath,
      Object.keys(vcheck?.analysisResults || {})
    );

    try {
      const vdoc = await Video.findById(id)
        .select("test ownerUid ownerEmail mouseCode mazeType")
        .lean();
      if (vdoc) {
        const mt = String(vdoc.mazeType || "").toLowerCase();
        const mz = metricsObj?.epm
          ? "epm"
          : metricsObj?.ymaze
            ? "ymaze"
            : metricsObj?.mwm
              ? "mwm"
              : mt.includes("morris") || mt.includes("mwm")
                ? "mwm"
                : mt.includes("y")
                  ? "ymaze"
                  : "epm";

        let Model, metricPayload;
        if (mz === "epm") {
          Model = EpmResult;
          metricPayload = metricsObj?.epm || metricsObj;
        } else if (mz === "ymaze") {
          Model = YMazeResult;
          metricPayload = metricsObj?.ymaze || metricsObj;
        } else {
          Model = MWMResult;
          const m = metricsObj?.mwm || metricsObj || {};
          const perq = m.per_quadrant || m.quadrants || {};
          const getQ = (k) =>
            Number(
              perq?.[k] ??
              m?.[k] ??
              m?.[`quadrant_${k.slice(1)}`] ??
              m?.quadrant_times?.[k] ??
              0
            );
          metricPayload = {
            quadrants: {
              Q1: getQ("Q1"),
              Q2: getQ("Q2"),
              Q3: getQ("Q3"),
              Q4: getQ("Q4"),
            },
            summary: {
              targetQuadrant:
                String(
                  m.target_quadrant ?? m.targetQuadrant ?? ""
                ).toUpperCase() || undefined,
              avg_in_target: Number(m.target_time ?? m.avg_in_target ?? 0),
            },
          };
        }

        await Model.updateOne(
          { video: id },
          {
            $set: {
              test: vdoc.test,
              video: id,
              ownerUid: vdoc.ownerUid,
              ownerEmail: vdoc.ownerEmail,
              mouseCode: vdoc.mouseCode,
              [mz]: metricPayload,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date(), mazeType: mz },
          },
          { upsert: true }
        );
      }
    } catch (e) {
      console.warn("upsert Result failed:", e?.message || e);
    }

    // (optional) roll-up สถานะ test แบบทันที + generate test-level report เมื่อเสร็จ
    const v = await Video.findById(id).select("test ownerUid").lean();
    if (v?.test) {
      const vids = await Video.find({ test: v.test, ownerUid: v.ownerUid })
        .select("status")
        .lean();
      const anyProc = vids.some((x) =>
        ["uploaded", "processing"].includes(x.status)
      );
      const anyFail = vids.some((x) => x.status === "failed");
      const next = anyProc ? "processing" : anyFail ? "failed" : "completed";

      await Test.updateOne(
        { _id: v.test, ownerUid: v.ownerUid },
        next === "processing"
          ? {
            $set: { status: "processing" },
            $unset: { processingCompletedAt: "" },
          }
          : { $set: { status: next, processingCompletedAt: new Date() } }
      );

      // ถ้า test เสร็จทุกวิดีโอแล้ว → รวมผลจาก "results" (fallback จาก Video.analysisResults ถ้ามี)
      if (next === "completed") {
        // ชนิด maze ของ test
        const testDoc = await Test.findOne({
          _id: v.test,
          ownerUid: v.ownerUid,
        })
          .select("behaviorTest")
          .lean();
        const bt = String(testDoc?.behaviorTest || "").toLowerCase();
        const mazeShort =
          bt.includes("elevatedplusmaze") || bt.includes("epm")
            ? "epm"
            : bt.includes("ymaze")
              ? "ymaze"
              : bt.includes("mwm") || bt.includes("morriswatermaze")
                ? "mwm"
                : "epm"; // default epm

        // 1) ดึงจาก Video.analysisResults ก่อน
        let vidsAll = await Video.find({
          test: v.test,
          ownerUid: v.ownerUid,
          status: "processed",
        })
          .select("mouseCode analysisResults dailyRecord")
          .populate({
            path: "dailyRecord",
            select: "group groupName mouse",
            populate: [
              { path: "group", select: "name" },
              {
                path: "mouse",
                select: "group groupName",
                populate: { path: "group", select: "name" },
              },
            ],
          })
          .lean();

        const getGroupName = (dr) =>
          dr?.groupName ||
          dr?.group?.name ||
          dr?.mouse?.groupName ||
          dr?.mouse?.group?.name ||
          "";

        let videosPayload = vidsAll
          .map((x) => {
            let m = x.analysisResults || {};
            if (!m || !Object.keys(m).length) return null;

            // shape ให้เป็น {epm:{...}}/{ymaze:{...}}/{mwm:{...}}
            if (!m.epm && !m.ymaze && !m.mwm) {
              m = { [mazeShort]: m };
            }

            return {
              mouseCode: x.mouseCode || "",
              groupName: getGroupName(x.dailyRecord),
              metrics: m,
            };
          })
          .filter(Boolean);

        // 2) ถ้ายังไม่มี metrics เลย ค่อย fallback ไปคอลเลกชัน Result (ไม่ filter mazeType)
        if (!videosPayload.length) {
          const resultsDocs = await Result.find({
            test: v.test,
            ownerUid: v.ownerUid,
          })
            .select("mouseCode epm ymaze mwm")
            .lean();

          videosPayload = resultsDocs
            .map((r) => {
              const m = r.epm
                ? { epm: r.epm }
                : r.ymaze
                  ? { ymaze: r.ymaze }
                  : r.mwm
                    ? { mwm: r.mwm }
                    : null;
              return m ? { mouseCode: r.mouseCode || "", metrics: m } : null;
            })
            .filter(Boolean);
        }

        console.log("videosPayload length:", videosPayload.length);
        if (!videosPayload.length) {
          console.warn(
            "make_test_report skipped: no metrics for test",
            String(v.test)
          );
        }

        // 3) ถ้ายังว่างอยู่ ไม่ต้องเรียก report เพื่อเลี่ยง 400
        if (!videosPayload.length) {
          console.warn(
            "make_test_report skipped: no metrics for test",
            String(v.test)
          );
        } else {
          try {
            const { data: rep } = await axios.post(
              `${ANALYSIS_API}/report/test`,
              {
                secret: PROGRESS_SECRET,
                testId: String(v.test),
                mazeType: mazeShort,
                videos: videosPayload,
              },
              { timeout: 60000 }
            );
            console.log("report/test response:", rep);
            if (rep?.ok && rep?.url) {
              await Test.updateOne(
                { _id: v.test, ownerUid: v.ownerUid },
                {
                  $set: {
                    resultExcelPath: rep.url,
                    resultExcelGcsPath: rep.gcsPath || undefined,
                  },
                }
              );
            } else {
              console.warn("report/test returned no url");
            }
          } catch (e) {
            console.error(
              "report/test failed:",
              e?.response?.status,
              e?.response?.data || e?.message
            );
          }
        }
      }
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
};
