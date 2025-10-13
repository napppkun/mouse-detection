// routes/fileRoutes.js
import express from "express";
import axios from "axios";
import { verifyFirebase } from "../middleware/verifyFirebase.js";

const router = express.Router();

// GET /api/files/proxy?url=...&filename=optional.ext&inline=1
router.get("/proxy", verifyFirebase, async (req, res) => {
  const { url, filename, inline } = req.query;
  if (!url) return res.status(400).send("Missing url");

  try {
    // ส่งต่อ Range header (สำคัญกับ <video>)
    const range = req.headers.range;
    const ax = await axios.get(url, {
      responseType: "stream",
      headers: range ? { Range: range } : undefined,
      // timeout อย่าใส่สั้น ๆ เพราะเป็นไฟล์ใหญ่
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true, // ให้เรา forward สถานะเอง
    });

    // เดาชื่อไฟล์ (ถ้าต้องดาวน์โหลด)
    let name = filename;
    if (!name) {
      try {
        const u = new URL(url);
        name = decodeURIComponent(u.pathname.split("/").pop() || "download.bin");
      } catch {
        name = "download.bin";
      }
    }

    // content-type จากต้นทาง
    const ct = ax.headers["content-type"] || "";
    if (ct) res.setHeader("Content-Type", ct);
    // forward ความยาว/ช่วง
    if (ax.headers["content-length"])
      res.setHeader("Content-Length", ax.headers["content-length"]);
    if (ax.headers["accept-ranges"])
      res.setHeader("Accept-Ranges", ax.headers["accept-ranges"]);
    if (ax.headers["content-range"])
      res.setHeader("Content-Range", ax.headers["content-range"]);

    // ถ้า inline=1 → เล่นบนหน้าเว็บ; ไม่งั้นบังคับดาวน์โหลด
    if (String(inline) !== "1") {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${name}"`
      );
    } else {
      // กันบางเคสที่เบราว์เซอร์ยังถือเป็นดาวน์โหลด
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${name}"`
      );
    }

    res.status(ax.status); // 200 หรือ 206 ตามที่ต้นทางให้มา
    ax.data.pipe(res);
  } catch (e) {
    console.error("[file proxy] failed:", e?.message);
    res.status(502).send("Bad gateway");
  }
});

export default router;
