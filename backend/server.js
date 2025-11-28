// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";

import connectDB from "./config/db.js";

import userRoutes from "./routes/userRoutes.js";
import miceRoutes from "./routes/miceRoutes.js";
import dailyRecordRoutes from "./routes/dailyRecordRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import videoRoutes from "./routes/videoRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import uploadsRoutes from "./routes/uploadsRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";


connectDB();

const app = express();

// Cloud Run / behind proxy
app.set("trust proxy", true);

const parseList = (v) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\/+$/, "")); 

const allowOrigins = [
  ...parseList(process.env.CORS_ORIGINS),
  ...parseList(process.env.FRONTEND_URL),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// ใช้ array ตรง ๆ เพื่อลดโอกาส preflight 500
app.use(
  cors({
    origin: allowOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true, // ไม่ใช้ cookie/session
    exposedHeaders: ["Content-Disposition"],
    maxAge: 86400, // cache preflight 1 วัน
  })
);

// รองรับ preflight ทุกเส้นทาง
app.options(
  "*",
  cors({
    origin: allowOrigins,
    allowedHeaders: ["Authorization", "Content-Type"],
  })
);

app.use(express.json({ limit: "2mb" })); // meta/JSON พอ

app.use("/api/users", userRoutes);
app.use("/api/mice", miceRoutes);
app.use("/api/records", dailyRecordRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/templates", templateRoutes);

app.get("/", (req, res) => {
  res.json({
    status: "Server Running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.use((req, res, next) => {
  res.status(404).json({ message: "Not Found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err?.message);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));