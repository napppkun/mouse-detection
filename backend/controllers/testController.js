// controllers/testController.js
import Test from "../models/testModel.js";
import Video from "../models/videoModel.js";
import axios from "axios";
import { Storage } from "@google-cloud/storage";
import {
  deleteFileFromGCS,
  uploadBufferToGCS,
} from "../services/gcsUploader.js";
import archiver from "archiver";
import ExcelJS from "exceljs";
import {
  Result,
  EpmResult,
  YMazeResult,
  MWMResult,
} from "../models/resultModel.js";
import DailyRecord from "../models/dailyRecordModel.js";

const ANALYSIS_API = process.env.ANALYSIS_API || "http://localhost:8000";

let storage;
try {
  const creds = process.env.GOOGLE_CLOUD_KEY ? JSON.parse(process.env.GOOGLE_CLOUD_KEY) : undefined;
  storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    ...(creds ? { credentials: creds } : {}),
  });
} catch (e) {
  console.error("Invalid GOOGLE_CLOUD_KEY JSON:", e?.message);
  storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
}
const bucketName = process.env.GOOGLE_CLOUD_BUCKET;

// ───────────────── helpers ─────────────────
async function signedUrlFromGcsPath(gcsPath) {
  const file = storage.bucket(bucketName).file(gcsPath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 24 * 60 * 60 * 1000, // 24 ชม.
  });
  return url;
}

async function getReadableUrlFromDoc(vDoc) {
  if (!vDoc) return null;
  if (vDoc.processedGcsPath && String(vDoc.processedGcsPath).trim()) {
    return await signedUrlFromGcsPath(vDoc.processedGcsPath);
  }
  if (vDoc.processedPath && String(vDoc.processedPath).trim()) {
    return vDoc.processedPath;
  }
  if (vDoc.gcsPath && String(vDoc.gcsPath).trim()) {
    return await signedUrlFromGcsPath(vDoc.gcsPath);
  }
  if (vDoc.path && String(vDoc.path).trim()) {
    return vDoc.path;
  }
  return null;
}

async function getReadableExcelUrlFromDoc(vDoc) {
  if (!vDoc) return null;
  if (vDoc.excelGcsPath && String(vDoc.excelGcsPath).trim()) {
    return await signedUrlFromGcsPath(vDoc.excelGcsPath);
  }
  if (vDoc.excelPath && String(vDoc.excelPath).trim()) {
    return vDoc.excelPath;
  }
  return null;
}

async function ensureVideoDoc(v) {
  if (typeof v === "string") {
    return await Video.findById(v)
      .select(
        `
      originalName filename path gcsPath
 processedPath processedGcsPath
 mouseCode status trimStartSec trimEndSec
 dayIndex releaseQuadrant targetQuadrant
 duration
    `
      )
      .lean();
  }
  if (
    v &&
    v._id &&
    v.path === undefined &&
    v.gcsPath === undefined &&
    v.processedPath === undefined &&
    v.processedGcsPath === undefined
  ) {
    return await Video.findById(v._id)
      .select(
        `
      originalName filename path gcsPath
      processedPath processedGcsPath
      mouseCode status trimStartSec trimEndSec
      dayIndex releaseQuadrant targetQuadrant
      duration
    `
      )
      .lean();
  }
  return v;
}

function normalizeMaze(s) {
  const t = String(s || "").toLowerCase();
  if (["epm", "elevatedplusmaze", "elevated_plus_maze"].includes(t)) return "epm";
  if (["ymaze", "y_maze"].includes(t)) return "ymaze";
  if (["mwm", "morriswatermaze", "morris_water_maze"].includes(t)) return "mwm";
  return "epm";
}

function safeName(s) {
  return String(s || "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function buildTimestampParts(d = new Date()) {
  const yyyy = d.getFullYear();
  const MM = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return {
    yyyy,
    MM,
    dd,
    HH,
    mm,
    ss,
    yyyymmdd_hhmmss: `${yyyy}${MM}${dd}_${HH}${mm}${ss}`,
  };
}
function formatPattern(pattern, ctx) {
  const ts = buildTimestampParts(ctx.now || new Date());
  const map = {
    "{testName}": safeName(ctx.testName),
    "{maze}": String(ctx.maze || "").toLowerCase(),
    "{id}": String(ctx.id || ""),
    "{videoCount}": String(ctx.videoCount ?? ""),
    "{yyyy}": ts.yyyy,
    "{MM}": ts.MM,
    "{dd}": ts.dd,
    "{HH}": ts.HH,
    "{mm}": ts.mm,
    "{ss}": ts.ss,
    "{yyyyMMdd_HHmmss}": ts.yyyymmdd_hhmmss,
  };
  let out = String(pattern);
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}
function normalizeMazeShort(s) {
  const t = String(s || "").toLowerCase();
  if (t.includes("epm") || t.includes("elevated")) return "epm";
  if (t.includes("ymaze") || t.includes("y_maze")) return "ymaze";
  if (t.includes("mwm") || t.includes("morris")) return "mwm";
  return "epm";
}

// ────────────────── controllers ─────────────────
export const analyzeTest = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { id } = req.params;

    const {
      mazeType,
      trimStart = 0,
      trimEnd = 0,
      rectanglesByMouse = {},
      perVideoTimesById = {},
      strict = "0",
      targetQuadrant, // MWM only
      // circle/ellipse template keyed by mouseCode
      mwmTemplateByMouse = {},
    } = req.body || {};

    const test = await Test.findOne({ _id: id, ownerUid })
      .populate({
        path: "videos",
        select: `
          originalName filename path gcsPath
          processedPath processedGcsPath
          mouseCode status trimStartSec trimEndSec
          dayIndex releaseQuadrant targetQuadrant
          duration
        `,
      })
      .lean();
    if (!test)
      return res
        .status(404)
        .json({ success: false, message: "Test not found" });

    const vids =
      (await Promise.all(
        (test.videos || []).filter(Boolean).map(ensureVideoDoc)
      )) || [];

    // ข้ามวิดีโอที่ processed แล้ว
    const vidsToRun = vids.filter(v => (v.status || "").toLowerCase() !== "processed");
    if (!vidsToRun.length) {
      return res.json({ success: true, data: { queued: 0, message: "All videos already processed" } });
    }
    if (!vids.length)
      return res
        .status(400)
        .json({ success: false, message: "No videos attached to this test" });

    // 1) normalize maze + limit
    const mazeShort = normalizeMaze(mazeType || test.behaviorTest);
    const analyzerMaze = mazeShort; // 'epm' | 'ymaze' | 'mwm'
    const limit = Number(test.trimLimitSec) || (mazeShort === "mwm" ? 60 : 300);
    const tq =
      mazeShort === "mwm"
        ? String(targetQuadrant || "Q1").toUpperCase()
        : undefined;
    const validTQ = ["Q1", "Q2", "Q3", "Q4"];
    if (mazeShort === "mwm" && !validTQ.includes(tq)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid targetQuadrant" });
    }

    // 2) global trim window
    let gStart = Math.max(0, Number(trimStart) || 0);
    let gEnd = Math.max(0, Number(trimEnd) || 0);
    if (gEnd <= gStart) gEnd = gStart + 1;
    if (gEnd - gStart > limit) gEnd = gStart + limit;

    const items = [];
    const missing = [];
    const noBox = [];
    const runId = Date.now();

    for (const v of vidsToRun) {
      const src = await getReadableUrlFromDoc(v);
      if (!src) {
        missing.push({ _id: String(v._id), mouseCode: v.mouseCode });
        continue;
      }

      // Rectangles (EPM/Ymaze or user insists on rectangles for MWM)
      let boxes = Array.isArray(rectanglesByMouse?.[v.mouseCode])
        ? rectanglesByMouse[v.mouseCode].map((b) => ({
          type:
            mazeShort === "mwm" && /^Q[1-4]$/i.test(String(b.type || ""))
              ? `quadrant_${String(b.type).slice(1)}`
              : String(b.type || ""),
          x: Number(b.x),
          y: Number(b.y),
          width: Number(b.width),
          height: Number(b.height),
          rotation: Number(b.rotation || 0),
        }))
        : [];

      // ellipse template
      let ellipseTemplate = undefined;
      if (mazeShort === "mwm") {
        const t = mwmTemplateByMouse?.[v.mouseCode];
        if (t && Number.isFinite(Number(t.cx)) && Number.isFinite(Number(t.cy))) {
          const rx = Number(t.rx ?? t.r);
          const ry = Number(t.ry ?? t.r);
          ellipseTemplate = {
            type: "ellipse",
            cx: Number(t.cx),
            cy: Number(t.cy),
            rx: Number.isFinite(rx) ? rx : 0,
            ry: Number.isFinite(ry) ? ry : 0,
            rotationDeg: Number(t.rotationDeg || 0),
          };
        }
      }

      // log mapping
      if (mazeShort === "mwm") {
        console.log(
          "[analyzeTest] mouse=%s boxes=%j template=%j",
          v.mouseCode,
          (boxes || []).map((bb) => bb.type),
          ellipseTemplate ? { ...ellipseTemplate, type: "ellipse" } : null
        );
      }
      if (!boxes.length && !ellipseTemplate) {
        noBox.push({ _id: String(v._id), mouseCode: v.mouseCode });
      }

      // time window per video
      const hardMax =
        typeof v.duration === "number" && v.duration > 0
          ? Math.max(0, v.duration)
          : Infinity;

      const pv = perVideoTimesById?.[String(v._id)];
      let startSec = Math.max(0, Number(pv?.startSec ?? gStart) || 0);
      let endSec = Math.max(0, Number(pv?.endSec ?? gEnd) || 0);

      if (startSec > hardMax) startSec = Math.max(0, hardMax - 1);
      if (endSec > hardMax) endSec = hardMax;
      if (endSec <= startSec) endSec = Math.min(hardMax, startSec + 1);
      if (endSec - startSec > limit) {
        endSec = Math.min(endSec, startSec + limit, hardMax);
      }

      items.push({
        id: String(v._id),
        mouseCode: v.mouseCode,
        src,
        boxes,
        startSec,
        endSec,
        runId,
        ...(mazeShort === "mwm" ? { targetQuadrant: tq } : {}),
        ...(ellipseTemplate ? { template: ellipseTemplate } : {}),
      });
    }

    if (!items.length || (strict === "1" && (missing.length || noBox.length))) {
      return res.status(400).json({
        success: false,
        message: !items.length
          ? "No readable videos in this test"
          : "Some videos are not ready (missing URL or boxes/template)",
        details: { missing, noBox },
      });
    }

    // 4) mark processing + save trims onto Video docs
    const update = {
      status: vidsToRun.length ? "processing" : test.status,
      processingStartedAt: vidsToRun.length ? new Date() : test.processingStartedAt,
      boundingBoxes: rectanglesByMouse || {},
      settings: {
        ...(test.settings || {}),
        analysisStartTime: gStart,
        analysisEndTime: gEnd,
      },
      processingError: undefined,
    };

    // ถ้าเป็น MWM ให้เซฟ template อีกชุดหนึ่ง
    if (mazeShort === "mwm") {
      update.mwmTemplateByMouse = mwmTemplateByMouse || {};
    }

    await Test.updateOne(
      { _id: id, ownerUid },
      { $set: update }
    );

    const ops = items.map((i) => ({
      updateOne: {
        filter: { _id: i.id, ownerUid },
        update: {
          $set: {
            status: "processing",
            trimStartSec: i.startSec,
            trimEndSec: i.endSec,
            runId,
          },
        },
      },
    }));
    if (ops.length) await Video.bulkWrite(ops);

    console.log(
      "[analyzeTest] maze=%s analyzer=%s items=%d tq=%s",
      mazeShort,
      analyzerMaze,
      items.length,
      tq
    );

    await axios.post(
      `${ANALYSIS_API}/analyze/batch_async`,
      {
        testId: id,
        maze: analyzerMaze,
        mazeType: analyzerMaze,
        type: analyzerMaze,
        items,
        startedAt: runId,
        webhookUrl: `${process.env.BACKEND_URL || req.protocol + "://" + req.get("host")}/api/tests/analyze/webhook`,
      },
      { timeout: 60000 }
    );

    return res.json({
      success: true,
      data: { queued: items.length },
    });
  } catch (err) {
    console.error("analyzeTest error:", err);
    try {
      await Test.findByIdAndUpdate(req.params.id, {
        status: "failed",
        processingError: err.message,
        processingCompletedAt: new Date(),
      });
    } catch { }
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const analyzerWebhook = async (req, res) => {
  try {
    const secret = req.headers["x-progress-secret"] || req.body?.secret;
    if (secret !== process.env.PROGRESS_SECRET) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const { testId, results } = req.body || {};
    if (!testId || !Array.isArray(results)) {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }

    // ใช้ behaviorTest เป็น fallback เมื่อตีความ metrics ไม่ได้
    const testDoc = await Test.findById(testId).select("behaviorTest").lean();

    // ช่วยหยิบค่าจาก nested objects แบบยืดหยุ่น
    const pickDeep = (obj, pathList) => {
      for (const p of pathList) {
        const parts = p.split(".");
        let cur = obj, ok = true;
        for (const k of parts) {
          if (!cur || typeof cur !== "object" || !(k in cur)) { ok = false; break; }
          cur = cur[k];
        }
        if (ok && cur !== undefined && cur !== null) return cur;
      }
      return undefined;
    };

    // helper: ทำให้ Y-maze metrics มีโครง summary/sequence ที่แน่นอน
    const normalizeYmazeMetrics = (m) => {
      if (!m || typeof m !== "object") return null;
      const s = m.summary || m;
      const seq =
        Array.isArray(m.sequence)
          ? m.sequence.map((r, i) => ({
            entry: Number(r.entry ?? i + 1),
            arm: String(r.arm ?? ""),
            alternation: r.alternation === "" ? "" : Number(r.alternation ?? 0),
          }))
          : (Array.isArray(m.arm_sequence) && Array.isArray(m.alternation_results))
            ? m.arm_sequence.map((arm, i) => ({
              entry: i + 1,
              arm: String(arm ?? ""),
              alternation:
                (m.alternation_results[i] ?? "") === null
                  ? ""
                  : Number(m.alternation_results[i] ?? 0),
            }))
            : [];

      const total_entries = Number(s.total_entries ?? seq.length ?? 0);
      const noa = Number(s.no_of_alternations ?? s.no_of_alternation ?? 0);
      const denom = Math.max(0, total_entries - 2);
      const alt_pct = Number.isFinite(Number(s.alternation_percent))
        ? Number(s.alternation_percent)
        : denom ? Number(((noa / denom) * 100).toFixed(2)) : 0;

      return {
        summary: {
          A_entries: Number(s.A_entries ?? 0),
          B_entries: Number(s.B_entries ?? 0),
          C_entries: Number(s.C_entries ?? 0),
          total_entries,
          no_of_alternations: noa,
          alternation_percent: alt_pct,
          time_A: Number(s.time_A ?? s.A_time ?? 0),
          time_B: Number(s.time_B ?? s.B_time ?? 0),
          time_C: Number(s.time_C ?? s.C_time ?? 0),
        },
        sequence: seq,
      };
    };

    for (const r of results) {
      const vidId = r?.id;
      if (!vidId) continue;

      // รับ runId จาก result หรือ payload root
      const incomingRun = Number(r?.runId || req.body?.runId || req.body?.startedAt || 0);

      // อ่าน runId ล่าสุดใน DB เพื่อตัดสินใจเมินอัปเดตเก่า
      const vdoc = await Video.findById(vidId)
        .select("ownerUid ownerEmail mouseCode test dailyRecord runId status")
        .lean();
      const currentRun = Number(vdoc?.runId || 0);
      if (incomingRun && currentRun && incomingRun < currentRun) {
        // อัปเดตเก่า/มาช้า ข้ามไป
        continue;
      }

      // รองรับหลายรูปแบบของ payload
      const resultUrls =
        pickDeep(r, ["resultUrls", "result.urls", "urls", "outputs"]) || {};
      const metricsRaw =
        pickDeep(r, [
          "metrics",
          "analysis_results",
          "analysisResults",
          "result.metrics",
          "payload.metrics",
        ]) || {};

      const st = String(r?.status || "").toLowerCase();
      const okLike = ["ok", "success", "done", "completed"];

      const hasVideo = !!pickDeep(resultUrls, [
        "processedVideo", "video", "processed_video", "overlay", "outputVideo", "output_video"
      ]);
      const hasExcel = !!pickDeep(resultUrls, [
        "excelFile", "excel", "excel_url", "xlsx", "excel_file"
      ]);

      const trajectoryMeta = metricsRaw?.trajectory_metadata || {};
      const trajectory = Array.isArray(trajectoryMeta?.trajectory)
        ? trajectoryMeta.trajectory.map(p => ({
          t: Number(p.t ?? 0),
          x: Number(p.x ?? 0),
          y: Number(p.y ?? 0),
          region: String(p.region ?? "")
        }))
        : undefined;

      const videoDimensions = trajectoryMeta?.videoDimensions ? {
        width: Number(trajectoryMeta.videoDimensions.width || 0),
        height: Number(trajectoryMeta.videoDimensions.height || 0)
      } : undefined;

      const trajectoryMetadata = {
        sampleInterval: Number(trajectoryMeta?.sampleInterval || 0),
        totalPoints: Number(trajectoryMeta?.totalPoints || 0),
        duration: Number(trajectoryMeta?.duration || 0)
      };

      // ตีความชนิด maze จาก metrics หรือ fallback ไปที่ behaviorTest ของ Test
      const inferMazeFromMetrics = () =>
        metricsRaw?.epm ? "epm" :
          metricsRaw?.ymaze ? "ymaze" :
            metricsRaw?.mwm ? "mwm" : null;
      const mazeKind = inferMazeFromMetrics() ||
        (String(testDoc?.behaviorTest || "").toLowerCase().includes("y") ? "ymaze"
          : String(testDoc?.behaviorTest || "").toLowerCase().includes("morris") ? "mwm"
            : "epm");

      if (okLike.includes(st) || hasVideo || hasExcel) {
        // success path: อัปเดตเอกสาร Video
        await Video.updateOne(
          { _id: vidId },
          {
            $set: {
              status: "processed",
              runId: incomingRun || currentRun || Date.now(),
              processedPath: pickDeep(resultUrls, [
                "processedVideo", "video", "processed_video", "overlay", "outputVideo", "output_video",
              ]) || undefined,
              processedGcsPath: pickDeep(resultUrls, [
                "processedGcsPath", "processed_video_gcs", "video_gcs", "output_video_gcs",
              ]) || undefined,
              excelPath: pickDeep(resultUrls, [
                "excelFile", "excel", "excel_url", "xlsx", "excel_file",
              ]) || undefined,
              excelGcsPath: pickDeep(resultUrls, [
                "excelGcsPath", "excel_gcs", "excel_file_gcs",
              ]) || undefined,
              analysisResults: metricsRaw || undefined,
            },
          }
        );

        // group/groupName (จาก DailyRecord หรือกลุ่มแรกของ Test)
        const tdoc = await Test.findById(vdoc?.test)
          .select("groups")
          .populate("groups", "name")
          .lean();

        const rec = await DailyRecord.findById(vdoc?.dailyRecord)
          .select("group")
          .populate("group", "name")
          .lean();

        const primaryFromTest = Array.isArray(tdoc?.groups) ? tdoc.groups[0] : undefined;
        const groupId = rec?.group?._id || primaryFromTest?._id;
        const groupName = rec?.group?.name || primaryFromTest?.name;

        // Base update object with trajectory
        const baseUpdate = {
          test: vdoc.test,
          video: vidId,
          ownerUid: vdoc.ownerUid,
          ownerEmail: vdoc.ownerEmail,
          mouseCode: vdoc.mouseCode,
          group: groupId,
          groupName: groupName,
          updatedAt: new Date(),
          ...(trajectory ? { trajectory } : {}),
          ...(videoDimensions ? { videoDimensions } : {}),
          ...(trajectoryMetadata.totalPoints > 0 ? { trajectoryMetadata } : {})
        };

        // กระจาย metrics ลง collection ตามชนิด
        if (mazeKind === "epm") {
          const payload = metricsRaw?.epm || metricsRaw || {};
          await EpmResult.updateOne(
            { video: vidId },
            {
              $set: {
                ...baseUpdate,
                epm: payload,
              },
              $setOnInsert: { createdAt: new Date(), mazeType: "epm" },
            },
            { upsert: true }
          );
        } else if (mazeKind === "ymaze") {
          const payload =
            normalizeYmazeMetrics(metricsRaw?.ymaze || metricsRaw) ||
            metricsRaw?.ymaze ||
            metricsRaw ||
            {};
          await YMazeResult.updateOne(
            { video: vidId },
            {
              $set: {
                ...baseUpdate,
                ymaze: payload,
              },
              $setOnInsert: { createdAt: new Date(), mazeType: "ymaze" },
            },
            { upsert: true }
          );
        } else {
          const m = metricsRaw?.mwm || metricsRaw || {};
          const q = m.per_quadrant || m.quadrants || {};
          const getQ = (src, key) =>
            Number(
              src?.[key] ??
              src?.[`${key}_time`] ??
              src?.quadrant_times?.[key] ??
              src?.[`quadrant_${key.slice(1)}`] ??
              0
            );
          const payload = {
            quadrants: {
              Q1: Number(q.Q1 ?? getQ(m, "Q1")),
              Q2: Number(q.Q2 ?? getQ(m, "Q2")),
              Q3: Number(q.Q3 ?? getQ(m, "Q3")),
              Q4: Number(q.Q4 ?? getQ(m, "Q4")),
            },
            summary: {
              targetQuadrant: String(m.target_quadrant ?? m.targetQuadrant ?? "").toUpperCase() || undefined,
              avg_in_target: Number(m.target_time ?? m.avg_in_target ?? 0),
            },
          };

          await MWMResult.updateOne(
            { video: vidId },
            {
              $set: {
                ...baseUpdate,
                mwm: payload,
              },
              $setOnInsert: { createdAt: new Date(), mazeType: "mwm" },
            },
            { upsert: true }
          );
        }
      } else {
        const isExplicitFail = st === "failed" || st === "error";
        if (isExplicitFail && (!vdoc || (vdoc.status !== "processed" && (incomingRun >= currentRun)))) {
          console.warn("[analyzerWebhook] marking FAILED", {
            vidId, incomingRun, currentRun, st, hasVideo, hasExcel
          });
          await Video.updateOne(
            { _id: vidId },
            { $set: { status: "failed", runId: incomingRun || currentRun || Date.now() } }
          );
        } else {
          console.warn("[analyzerWebhook] skip marking failed for", vidId, "st=", st, "hasVideo:", hasVideo, "hasExcel:", hasExcel);
        }
      }
    }

    // สรุปสถานะ Test (อนุญาต completed_with_errors) 
    const allVids = await Video.find({ test: testId }).select("status");
    const counts = allVids.reduce((a, v) => {
      a[v.status] = (a[v.status] || 0) + 1;
      return a;
    }, {});

    const anyProcessing = allVids.some(v => ["uploaded", "processing"].includes(v.status));
    const anyFailed = counts.failed > 0;
    const anyProcessed = counts.processed > 0;

    let status;
    if (anyProcessing) {
      status = "processing";
    } else if (anyProcessed && anyFailed) {
      status = "completed";
    } else if (anyFailed && !anyProcessed) {
      status = "failed";
    } else {
      status = "completed";
    }

    await Test.updateOne(
      { _id: testId },
      {
        $set: {
          status,
          processingCompletedAt: ["completed", "failed"].includes(status) ? new Date() : undefined,
          processingError: undefined,
          ...(anyProcessed && anyFailed ? { hasPartialFailures: true } : {}),
        },
        ...(status === "processing" ? { $unset: { processingCompletedAt: 1 } } : {}),
      }
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("analyzerWebhook error:", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

// list tests + filter/pagination
export const getAllTests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status, // created|configured|processing|completed|failed
      test: qTest,
      behaviorTest, // ElevatedPlusMaze|Ymaze|MorrisWaterMaze
      ownerUid, // optional: for admin; ถ้าไม่ส่ง ใช้ของผู้ใช้เอง
      q, // ค้นชื่อ
    } = req.query;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = {};
    // บังคับ scope ตาม owner
    query.ownerUid = ownerUid || req.user.ownerUid || req.user.uid;

    if (status) query.status = status;
    if (behaviorTest) query.behaviorTest = behaviorTest;
    else if (qTest) query.behaviorTest = qTest; // compat
    if (q) query.name = { $regex: q, $options: "i" };

    const [tests, total] = await Promise.all([
      Test.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      Test.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: tests,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        totalTests: total,
        hasNext: parseInt(page, 10) < Math.ceil(total / parseInt(limit, 10)),
        hasPrev: parseInt(page, 10) > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// get test by id
export const getTestById = async (req, res) => {
  try {
    const test = await Test.findOne({
      _id: req.params.id,
      ownerUid: req.user.ownerUid || req.user.uid,
    })
      .populate("groups", "_id name")
      .lean();

    if (!test) {
      return res
        .status(404)
        .json({ success: false, message: "Test not found" });
    }

    // --- สร้าง groupDetails จาก DailyRecord ของวิดีโอใน test นี้ ---
    // วิดีโอเก็บ mouseCode และอ้าง dailyRecord -> group
    const videos = await Video.find({ test: test._id })
      .select("mouseCode dailyRecord")
      .populate({
        path: "dailyRecord",
        select: "group",
        populate: { path: "group", select: "name" },
      })
      .lean();

    // map: groupId -> { _id, name, mice: [mouseCode] }
    const byGroup = new Map();
    for (const v of videos) {
      const gdoc = v?.dailyRecord?.group;
      const gId = gdoc?._id ? String(gdoc._id) : null;
      const gName = gdoc?.name || "";
      if (!gId) continue;

      if (!byGroup.has(gId))
        byGroup.set(gId, { _id: gId, name: gName, mice: [] });
      if (v.mouseCode) {
        const arr = byGroup.get(gId).mice;
        if (!arr.includes(v.mouseCode)) arr.push(v.mouseCode);
      }
    }

    // ถ้า test.groups มี แต่ DailyRecord ยังไม่ครบ ให้สร้าง entry ว่างไว้ก่อน
    for (const g of Array.isArray(test.groups) ? test.groups : []) {
      const gid = String(g._id || g);
      const gname = typeof g === "object" ? g.name || "" : "";
      if (!byGroup.has(gid))
        byGroup.set(gid, { _id: gid, name: gname, mice: [] });
    }

    const groupDetails = Array.from(byGroup.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );

    return res.json({ success: true, data: { ...test, groupDetails } });
  } catch (error) {
    console.error("Error fetching test:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// create test (ยังไม่ trigger ประมวลผล)
export const createTest = async (req, res) => {
  try {
    const {
      name,
      date, // เดิม (optional)
      dates, // สำหรับ MWM (optional)
      behaviorTest, // ElevatedPlusMaze|Ymaze|MorrisWaterMaze
      groups = [], // [groupId]
      dailyRecords = [],
      videos = [], // [videoId] ถ้ามีแล้ว
      mouseCode, // epm,ymaze,mwm
      boundingBoxes = [],
      settings = {},
      mwmPlan,
    } = req.body;

    const ownerUid = req.user.ownerUid || req.user.uid;
    const ownerEmail = req.user.ownerEmail || req.user.email;

    const newTest = await Test.create({
      name,
      date,
      dates,
      behaviorTest,
      groups,
      dailyRecords,
      videos,
      mouseCode,
      boundingBoxes,
      settings,
      mwmPlan,
      ownerUid,
      ownerEmail,
      status: "configured", // เริ่มเป็น configured
    });

    res.status(201).json({ success: true, data: newTest });
  } catch (error) {
    console.error("Error creating test:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// update test (meta/config)
export const updateTest = async (req, res) => {
  try {
    const test = await Test.findOne({
      _id: req.params.id,
      ownerUid: req.user.ownerUid || req.user.uid,
    });
    if (!test)
      return res
        .status(404)
        .json({ success: false, message: "Test not found" });

    if (["processing"].includes(test.status)) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot update while processing" });
    }

    const allowed = [
      "name",
      "date",
      "dates",
      "groups",
      "dailyRecords",
      "videos",
      "mouseCode",
      "boundingBoxes",
      "settings",
      "mwmPlan",
      "status",
      "behaviorTest",
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) test[k] = req.body[k];
    }
    await test.save();

    res.json({ success: true, message: "Test updated", data: test });
  } catch (error) {
    console.error("Error updating test:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// delete test
export const deleteTest = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { id } = req.params;

    const test = await Test.findOne({ _id: id, ownerUid });
    if (!test) {
      return res
        .status(404)
        .json({ success: false, message: "Test not found" });
    }

    if (test.status === "processing") {
      return res
        .status(400)
        .json({ success: false, message: "Cannot delete while processing" });
    }

    // หา video ทั้งหมดที่ผูกกับ test นี้
    const videos = await Video.find({ ownerUid, test: test._id }).select(
      "_id gcsPath processedGcsPath excelGcsPath"
    );

    // ลบไฟล์บน GCS (best-effort; ถ้าพลาดจะ log แต่ไปต่อ)
    for (const v of videos) {
      if (v.gcsPath) await deleteFileFromGCS(v.gcsPath);
      if (v.processedGcsPath) await deleteFileFromGCS(v.processedGcsPath);
      if (v.excelGcsPath) await deleteFileFromGCS(v.excelGcsPath);
    }

    // ลบเอกสารวิดีโอทั้งหมดของ test นี้
    const vidIds = videos.map((v) => v._id);
    if (vidIds.length) {
      await Video.deleteMany({ _id: { $in: vidIds }, ownerUid });
    }

    // ลบเอกสารผลลัพธ์ที่ผูกกับวิดีโอ/เทสต์นี้ทั้งหมด
    await Promise.all([
      EpmResult.deleteMany({
        ownerUid,
        $or: [{ video: { $in: vidIds } }, { test: test._id }],
      }),
      YMazeResult.deleteMany({
        ownerUid,
        $or: [{ video: { $in: vidIds } }, { test: test._id }],
      }),
      MWMResult.deleteMany({
        ownerUid,
        $or: [{ video: { $in: vidIds } }, { test: test._id }],
      }),
      Result.deleteMany({
        ownerUid,
        $or: [{ video: { $in: vidIds } }, { test: test._id }],
      }),
    ]);

    // ถ้ามีสรุประดับ Test เก็บใน GCS ก็ลบทิ้งด้วย
    // รองรับทั้ง resultExcelPath และ reportExcelPath เผื่อเคยใช้ชื่อเก่า
    const testExcelUrl = test.resultExcelPath || test.reportExcelPath;
    if (testExcelUrl) {
      try {
        // ถ้าเก็บเป็น GCS path (เช่น 'reports/uid/xxx.xlsx') แนะนำเซฟไว้ใน field แยก
        // ที่นี่ลองพยายามเดา path จาก URL (ถ้าเป็น signed URL ของ bucket เดียวกัน)
        // ถ้าแน่ใจว่าเก็บเป็น GCS path อยู่แล้ว ให้เปลี่ยนเป็น deleteFileFromGCS(test.resultExcelGcsPath)
        const u = new URL(testExcelUrl);
        // ตัวอย่าง path: https://storage.googleapis.com/<bucket>/<object-path>
        const objectPath = decodeURIComponent(
          u.pathname.replace(/^\/[^/]+\//, "")
        );
        if (objectPath) await deleteFileFromGCS(objectPath);
      } catch (e) {
        // เงียบ ๆ ไป ถ้า parse URL ไม่ได้
      }
    }

    // ลบ test เอง
    await Test.deleteOne({ _id: test._id });

    return res.json({
      success: true,
      message: "Test and related videos deleted",
      deleted: {
        testId: String(test._id),
        videos: vidIds.length,
        resultsDeleted: true,
      },
    });
  } catch (error) {
    console.error("Error deleting test (and videos):", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const buildTestReport = async (req, res) => {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { id } = req.params;

    // helper: ปัดทศนิยม 3 ตำแหน่ง (รองรับค่าว่าง/ไม่ใช่ตัวเลข)
    const r3 = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Number(n.toFixed(3)) : 0;
    };

    // helper: แปลงเป็นจำนวนเต็ม (วินาที) อย่างปลอดภัย
    const asInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : 0; // หรือใช้ Math.trunc(n) ถ้าไม่อยากปัดขึ้น/ลง
    };

    // helper: ชื่อชีต Excel ต้องสั้น <= 31 และไม่มีอักขระต้องห้าม
    const sheetNameSafe = (s) =>
      String(s || "")
        .replace(/[\\/*?:[\]]/g, "_")
        .slice(0, 31) || "sheet";

    // โหลด test + รายชื่อกลุ่ม (ไว้ทำ fallback ถ้ามีแค่กลุ่มเดียว)
    const test = await Test.findOne({ _id: id, ownerUid })
      .populate("groups", "name")
      .lean();
    if (!test) {
      return res
        .status(404)
        .json({ success: false, message: "Test not found" });
    }

    // mapping: videoId -> groupName / mouseCode -> groupName
    const vidDocs = await Video.find({ ownerUid, test: id })
      .select("_id mouseCode dailyRecord originalName filename duration trimStartSec trimEndSec")
      .populate({
        path: "dailyRecord",
        select: "group",
        populate: { path: "group", select: "name" },
      })
      .lean();

    const videoToGroup = new Map();
    const mouseToGroup = new Map();
    const videoMetaById = new Map(); // videoId -> { name, duration }

    for (const v of vidDocs) {
      const gname = v?.dailyRecord?.group?.name || "";
      if (gname) {
        videoToGroup.set(String(v._id), gname);
        if (v.mouseCode && !mouseToGroup.has(v.mouseCode)) {
          mouseToGroup.set(v.mouseCode, gname);
        }
      }
      const vname = v.originalName || v.filename || "";
      const vdur = Number(v.durationOriginalSec ?? v.duration);
      let durationSec = Number.isFinite(vdur) ? vdur
        : Number.isFinite(Number(v.trimEndSec - v.trimStartSec))
          ? Number(v.trimEndSec - v.trimStartSec)
          : 0;
      videoMetaById.set(String(v._id), { name: vname, duration: durationSec });
    }

    const fallbackGroupName =
      (Array.isArray(test.groups) &&
        test.groups.length === 1 &&
        test.groups[0]?.name) ||
      "";

    const mazeShort =
      test.behaviorTest === "ElevatedPlusMaze"
        ? "epm"
        : test.behaviorTest === "Ymaze"
          ? "ymaze"
          : "mwm";

    const wb = new ExcelJS.Workbook();

    // ============== EPM ==============
    if (mazeShort === "epm") {
      const rows = await EpmResult.find({ test: id, ownerUid })
        .select("video mouseCode epm")
        .lean();

      const enriched = rows.map((r) => {
        const g =
          videoToGroup.get(String(r.video)) ||
          (r.mouseCode ? mouseToGroup.get(r.mouseCode) : "") ||
          fallbackGroupName;
        return { ...r, groupName: g || "" };
      });
      enriched.sort(
        (a, b) =>
          (a.groupName || "").localeCompare(b.groupName || "") ||
          (a.mouseCode || "").localeCompare(b.mouseCode || "")
      );

      const ws = wb.addWorksheet("EPM");
      ws.addRow([
        "treatment_group",
        "mouse_code",
        "video",
        "duration_seconds",
        "open_arm_1",
        "open_arm_2",
        "closed_arm_1",
        "closed_arm_2",
        "avg_open_arm",
        "avg_closed_arm",
        "absolute_diff",
      ]);

      for (const r of enriched) {
        const e = r.epm || {};
        const meta = videoMetaById.get(String(r.video)) || {};
        ws.addRow([
          r.groupName,
          r.mouseCode ?? "",
          meta.name || "",
          asInt(meta.duration),
          r3(e.open_arm_1),
          r3(e.open_arm_2),
          r3(e.closed_arm_1),
          r3(e.closed_arm_2),
          r3(e.avg_open_arm),
          r3(e.avg_closed_arm),
          r3(e.absolute_diff),
        ]);
      }
    }

    // ============== Y-Maze ==============
    if (mazeShort === "ymaze") {
      const yRows = await YMazeResult.find({ test: id, ownerUid })
        .select("video mouseCode ymaze")
        .lean();

      const enriched = yRows.map((r) => {
        const g =
          videoToGroup.get(String(r.video)) ||
          (r.mouseCode ? mouseToGroup.get(r.mouseCode) : "") ||
          fallbackGroupName;
        return { ...r, groupName: g || "" };
      });
      enriched.sort(
        (a, b) =>
          (a.groupName || "").localeCompare(b.groupName || "") ||
          (a.mouseCode || "").localeCompare(b.mouseCode || "")
      );

      // ---- sequence: แยกชีตตาม group ----
      const byGroup = new Map();
      for (const r of enriched) {
        const g = r.groupName || "";
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(r);
      }

      for (const [gname, arr] of byGroup.entries()) {
        const sheetLabel = sheetNameSafe(`sequence_${gname || "unknown"}`);
        const seqWs = wb.addWorksheet(sheetLabel);

        // // แถว 1: แสดงชื่อ group ซ้ำตามจำนวนหนู (2 คอลัมน์ต่อเมาส์: arm, alternation)
        // seqWs.addRow(arr.flatMap(() => [gname || "", ""]));
        // แถว 2: ชื่อเมาส์ + "_alternation"
        seqWs.addRow(
          arr.flatMap((r) => [
            r.mouseCode || "",
            `${r.mouseCode || ""}_alternation`,
          ])
        );

        const maxLen = Math.max(
          0,
          ...arr.map((r) =>
            Array.isArray(r.ymaze?.sequence) ? r.ymaze.sequence.length : 0
          )
        );

        for (let i = 0; i < maxLen; i++) {
          const rowVals = [];
          for (const r of arr) {
            const seq = Array.isArray(r.ymaze?.sequence)
              ? r.ymaze.sequence
              : [];
            const entry = seq[i];
            if (!entry) {
              rowVals.push("", "");
            } else {
              rowVals.push(entry.arm ?? "");
              rowVals.push(
                entry.alternation === "" ||
                  entry.alternation === undefined ||
                  entry.alternation === null
                  ? ""
                  : Number(entry.alternation)
              );
            }
          }
          seqWs.addRow(rowVals);
        }
      }

      // ---- summary: คงเดิม แต่ปัดทศนิยม 3 ตำแหน่งใน A_time, B_time, C_time, alternation_percent ----
      const sumWs = wb.addWorksheet("summary");
      sumWs.addRow([
        "treatment_group",
        "mouse_code",
        "video",
        "duration_seconds",
        "A_time",
        "B_time",
        "C_time",
        "A_entries",
        "B_entries",
        "C_entries",
        "total_entries",
        "no_of_alternations",
        "alternation_percent",
      ]);

      for (const r of enriched) {
        const s = r.ymaze?.summary || {};
        const seq = Array.isArray(r.ymaze?.sequence) ? r.ymaze.sequence : [];
        const meta = videoMetaById.get(String(r.video)) || {};

        // total_entries: ใช้ของ summary ถ้ามี ไม่งั้นคำนวณจากความยาว sequence
        const total = Number.isFinite(Number(s.total_entries))
          ? Number(s.total_entries)
          : seq.length;

        // no_of_alternations: ถ้าใน summary ไม่มี/ไม่ใช่ตัวเลข ให้ derive จาก sequence
        // นับเฉพาะ alternation === 1
        let noa = Number(s.no_of_alternations ?? s.no_of_alternation);
        if (!Number.isFinite(noa)) {
          noa = seq.reduce(
            (sum, e) => sum + (Number(e?.alternation) === 1 ? 1 : 0),
            0
          );
        }

        // alternation_percent: ถ้าไม่มี ให้คำนวณจากสูตร (noa / (total-2)) * 100
        const denom = Math.max(0, total - 2);
        let altPct = Number(s.alternation_percent);
        if (!Number.isFinite(altPct)) {
          altPct = denom ? (noa / denom) * 100 : 0;
        }

        sumWs.addRow([
          r.groupName,
          r.mouseCode ?? "",
          meta.name || "",
          asInt(meta.duration),
          r3(s.A_time ?? s.time_A),
          r3(s.B_time ?? s.time_B),
          r3(s.C_time ?? s.time_C),
          Number(s.A_entries ?? 0),
          Number(s.B_entries ?? 0),
          Number(s.C_entries ?? 0),
          total,
          noa,
          r3(altPct),
        ]);
      }
    }

    // ============== MWM ==============
    if (mazeShort === "mwm") {
      const mRows = await MWMResult.find({ test: id, ownerUid })
        .select("video mouseCode mwm")
        .lean();

      const enriched = mRows.map((r) => {
        const g =
          videoToGroup.get(String(r.video)) ||
          (r.mouseCode ? mouseToGroup.get(r.mouseCode) : "") ||
          fallbackGroupName;
        return { ...r, groupName: g || "" };
      });
      enriched.sort(
        (a, b) =>
          (a.groupName || "").localeCompare(b.groupName || "") ||
          (a.mouseCode || "").localeCompare(b.mouseCode || "")
      );

      // per-mouse quadrants (rename headers)
      const qws = wb.addWorksheet("quadrants");
      qws.addRow([
        "treatment_group",
        "mouse_code",
        "video",
        "duration_seconds",
        "Q1_time",
        "Q2_time",
        "Q3_time",
        "Q4_time",
      ]);
      for (const r of enriched) {
        const m = r.mwm || {};
        const meta = videoMetaById.get(String(r.video)) || {};
        const q1 = r3(m.quadrants?.Q1 ?? m.per_quadrant?.Q1);
        const q2 = r3(m.quadrants?.Q2 ?? m.per_quadrant?.Q2);
        const q3 = r3(m.quadrants?.Q3 ?? m.per_quadrant?.Q3);
        const q4 = r3(m.quadrants?.Q4 ?? m.per_quadrant?.Q4);
        qws.addRow([
          r.groupName,
          r.mouseCode || "",
          meta.name || "",
          asInt(meta.duration),
          q1, q2, q3, q4
        ]);
      }

      // group summary:
      // แถวแรก: target_quadrant (โหวต mode จากข้อมูลทั้งหมด)
      const sws = wb.addWorksheet("summary");
      const allTQs = [];
      const byGroup = new Map();
      for (const r of enriched) {
        const m = r.mwm || {};
        const tq = String(
          m?.summary?.targetQuadrant || m?.target_quadrant || ""
        ).toUpperCase();
        const tt = Number(m?.summary?.avg_in_target ?? m?.target_time ?? 0);
        if (tq) allTQs.push(tq);
        const g = r.groupName || "";
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push({ tq, tt });
      }
      const mode = (arr) => {
        const count = new Map();
        for (const x of arr) count.set(x, (count.get(x) || 0) + 1);
        let best = "",
          bestN = -1;
        for (const [k, v] of count) if (v > bestN) (best = k), (bestN = v);
        return best;
      };
      const globalTQ = mode(allTQs) || "";

      sws.addRow(["target_quadrant", globalTQ]); // แถวแรกบอกครั้งเดียว
      sws.addRow(["treatment_group", "avg_target_time"]); // หัวตาราง
      for (const [g, arr] of byGroup.entries()) {
        const avg = arr.length
          ? arr.reduce((s, v) => s + v.tt, 0) / arr.length
          : 0;
        sws.addRow([g, r3(avg)]);
      }
    }

    // ===== upload & save =====
    const buf = await wb.xlsx.writeBuffer();
    const key = `reports/${ownerUid}/test_${id}_${Date.now()}.xlsx`;
    const url = await uploadBufferToGCS(
      buf,
      key,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await Test.updateOne(
      { _id: id, ownerUid },
      { $set: { resultExcelPath: url } }
    );
    return res.json({ success: true, reportUrl: url });
  } catch (error) {
    console.error("buildTestReport error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ดึงลิงก์ดาวน์โหลดไฟล์ที่ประมวลผลสำเร็จทั้งหมดของ test หนึ่งตัว (ไม่รวมไฟล์วิดีโอต้นฉบับ)
export const getTestDownloads = async (req, res) => {
  const ownerUid = req.user.ownerUid || req.user.uid;
  const { id } = req.params;

  const test = await Test.findOne({ _id: id, ownerUid }).lean();
  if (!test)
    return res.status(404).json({ success: false, message: "Test not found" });

  const vids = await Video.find({ ownerUid, test: id })
    .select(
      `
      mouseCode originalName status
      path gcsPath
      processedPath processedGcsPath
      excelPath excelGcsPath
      analysisResults
    `
    )
    .lean();

  // เฉพาะที่ประมวลผลสำเร็จ
  const processed = vids.filter((v) => v.status === "processed");

  res.json({
    success: true,
    data: await Promise.all(
      processed.map(async (v) => ({
        id: String(v._id),
        mouseCode: v.mouseCode,
        originalName: v.originalName,
        processedVideoUrl: await getReadableUrlFromDoc(v),
        excelUrl: await getReadableExcelUrlFromDoc(v),
        analysisResults: v.analysisResults || {},
      }))
    ),
    counts: {
      total: vids.length,
      processed: processed.length,
      failed: vids.filter((v) => v.status === "failed").length,
      pending: vids.filter(
        (v) => v.status !== "processed" && v.status !== "failed"
      ).length,
    },
  });
};

// รวมเป็น ZIP แล้วสตรีมให้โหลด
export const downloadTestZip = async (req, res) => {
  const ownerUid = req.user.ownerUid || req.user.uid;
  const { id } = req.params;

  const test = await Test.findOne({ _id: id, ownerUid }).lean();
  if (!test)
    return res.status(404).json({ success: false, message: "Test not found" });

  const vids = await Video.find({ ownerUid, test: id })
    .select(`
      mouseCode originalName status
      path gcsPath
      processedPath processedGcsPath
      excelPath excelGcsPath
    `)
    .lean();

  const SUMMARY_PATTERN = "{testName}_{maze}_{yyyyMMdd_HHmmss}.xlsx";
  const ZIP_PATTERN = "{testName}_{maze}_{yyyyMMdd_HHmmss}_results.zip";

  const ctxBase = {
    testName: test.name || `test_${id}`,
    maze: normalizeMazeShort(test.behaviorTest),
    id,
    now: new Date(),
  };

  const files = [];
  const processed = vids.filter((v) => v.status === "processed");
  const processedCount = processed.length;

  // 1) แนบ summary Excel ถ้ามี (หรือสร้างใหม่ถ้าไม่มี — แบบ best effort)
  let summaryUrl = test.resultExcelPath || null;
  if (!summaryUrl) {
    try {
      const { data } = await axios.post(
        `${req.protocol}://${req.get("host")}/api/tests/${id}/report/build`,
        null,
        {
          headers: { Authorization: req.headers.authorization },
          timeout: 60000,
        }
      );
      summaryUrl = data?.reportUrl || null;
    } catch (e) {
      console.warn("Generate summary failed:", e?.response?.status, e?.message);
    }
  }
  if (summaryUrl) {
    const summaryName = formatPattern(SUMMARY_PATTERN, {
      ...ctxBase,
      videoCount: processedCount,
    });
    files.push({ url: summaryUrl, name: summaryName });
  }

  // 2) แนบ processed videos
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i];
    if (v.status !== "processed") continue;

    // วิดีโอ
    const videoUrl = await getReadableUrlFromDoc(v);
    if (videoUrl) {
      const base = v.mouseCode
        ? `mouse_${safeName(v.mouseCode)}_processed`
        : `video_${i + 1}_processed`;
      let ext = ".mp4";
      try {
        const p = new URL(videoUrl).pathname;
        const got = p.includes(".") ? p.substring(p.lastIndexOf(".")) : "";
        if (got) ext = got;
      } catch { }
      const niceName = `${safeName(ctxBase.testName)}_${ctxBase.maze}_${base}${ext}`;
      files.push({ url: videoUrl, name: niceName });
    }
  }

  // 3) ถ้าไม่มีอะไรให้ดาวน์โหลดจริง ๆ ค่อย 400
  if (!files.length) {
    return res
      .status(400)
      .json({ success: false, message: "No processed outputs to download." });
  }

  const zipName = formatPattern(ZIP_PATTERN, {
    ...ctxBase,
    videoCount: processedCount,
  });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(
      zipName
    )}`
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error("archiver error:", err?.message);
    try { res.end(); } catch { }
  });
  archive.pipe(res);

  for (const f of files) {
    try {
      const r = await axios.get(f.url, {
        responseType: "stream",
        timeout: 600000,
      });
      archive.append(r.data, { name: f.name });
    } catch (e) {
      archive.append(`Failed to fetch: ${f.url}\n${e?.message || ""}\n`, {
        name: `__errors__/${safeName(f.name)}.txt`,
      });
    }
  }

  archive.finalize();
};
