// components/ProgressTray.jsx
import React from "react";
import { useProgress } from "../context/ProgressCenter";
import { X } from "lucide-react";
import "../styles/app.css";

export default function ProgressTray() {
  const { jobs, removeJob, refreshOnce } = useProgress(); // <— เพิ่ม refreshOnce

  if (!jobs.length) return null;

  return (
    <div
      className="progress-tray" /* pointer-events:none ถูกกำหนดใน CSS แล้ว */
    >
      {jobs.map((j) => {
        const done = j.status === "processed";
        const failed = j.status === "failed";
        const cls = `progress-card${done ? " is-done" : ""}${
          failed ? " is-failed" : ""
        }`;
        const pct = Math.round((j.progress || 0) * 100);
        return (
          <div key={j.id} className={cls}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <div className="title">{j.label || j.id}</div>
              <button
                onClick={() => removeJob(j.id)}
                className="icon-btn"
                aria-label="Dismiss"
                title="Dismiss"
                style={{ pointerEvents: "auto" }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="muted">
              {j.status === "processed"
                ? "Done"
                : j.status === "failed"
                ? "Failed"
                : j.stage || "Processing..."}
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
