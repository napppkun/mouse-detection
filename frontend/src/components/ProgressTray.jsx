// components/ProgressTray.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useProgress } from "../context/ProgressCenter";
import { X, ChevronDown, ChevronUp, CheckCircle2, RotateCcw } from "lucide-react";
import { auth } from "../firebase";
import "../styles/app.css";

const API_BASE = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";
const ANALYSIS_BASE = window._env_?.ANALYSIS_API || process.env.ANALYSIS_API || "http://127.0.0.1:8000";

function useCollapsedState() {
  const [map, setMap] = useState({});
  const uid = auth.currentUser?.uid || "_anon_";
  const KEY = `progress:collapsed:${uid}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMap(JSON.parse(raw));
    } catch { }
  }, [uid]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch { }
  }, [map, uid]);

  const toggle = (groupId) =>
    setMap((prev) => ({ ...prev, [groupId]: !prev[groupId] }));

  return { collapsed: map, toggle };
}

// ดึง result เต็มจาก Modal แล้วยิง webhook เองผ่าน backend
async function recoverVideo(videoId, testId, mazeType) {
  const u = auth.currentUser;
  if (!u) throw new Error("Please log in");
  const idToken = await u.getIdToken(true);

  // 1) เช็คว่า Modal ประมวลผลเสร็จจริงไหม
  const progressRes = await fetch(`${ANALYSIS_BASE}/progress/${videoId}`);
  if (!progressRes.ok) throw new Error("Cannot reach analysis service");
  const jobState = await progressRes.json();

  if (jobState?.status !== "processed") {
    throw new Error(`Analysis not ready (status: ${jobState?.status || "unknown"})`);
  }

  // 2) สั่ง backend ให้ดึงผลจาก Modal แล้วบันทึกลง DB เอง
  const res = await fetch(`${API_BASE}/api/videos/${videoId}/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ testId, mazeType }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Recovery failed");
  return json;
}

export default function ProgressTray() {
  const { jobs, removeJob, removeJobsByTestId, refreshOnce } = useProgress();
  const { collapsed, toggle } = useCollapsedState();
  const [recovering, setRecovering] = useState({}); // { [videoId]: true }
  const [recoverError, setRecoverError] = useState({}); // { [videoId]: "message" }

  const groups = useMemo(() => {
    if (!jobs.length) return [];
    const g = new Map();
    for (const j of jobs) {
      const gid = j.testId || "__ungrouped__";
      if (!g.has(gid)) g.set(gid, { id: gid, name: j.testName || "Test", items: [] });
      const name = j.testName || g.get(gid).name || "Test";
      g.set(gid, { ...g.get(gid), name, items: [...g.get(gid).items, j] });
    }
    return Array.from(g.values()).sort((a, b) => {
      const aDone = a.items.every((x) => x.status === "processed");
      const bDone = b.items.every((x) => x.status === "processed");
      return aDone === bDone ? 0 : aDone ? 1 : -1;
    });
  }, [jobs]);

  const handleRecover = async (j) => {
    const videoId = j.id;
    setRecovering((p) => ({ ...p, [videoId]: true }));
    setRecoverError((p) => ({ ...p, [videoId]: null }));
    try {
      await recoverVideo(videoId, j.testId, j.mazeType);
      // รีเฟรช status ของ video นี้ใน ProgressCenter
      await refreshOnce(videoId);
    } catch (e) {
      setRecoverError((p) => ({ ...p, [videoId]: e.message }));
    } finally {
      setRecovering((p) => ({ ...p, [videoId]: false }));
    }
  };

  // Retry All failed ในกลุ่มเดียว ทีละตัวไม่ต้อง parallel
  const handleRecoverAll = async (items) => {
    const failed = items.filter((j) => j.status === "failed");
    for (const j of failed) {
      await handleRecover(j).catch(() => { });
    }
  };

  if (!jobs.length) return null;

  return (
    <div className="progress-tray right-bottom">
      {groups.map((G) => {
        const allDone = G.items.every((x) => x.status === "processed");
        const hasFailed = G.items.some((x) => x.status === "failed");
        const isCollapsed = !!collapsed[G.id];
        const isRecoveringGroup = G.items.some((j) => recovering[j.id]);

        return (
          <div key={G.id} className="progress-card-group">
            {/* Header */}
            <div className="progress-group-header">
              <div className="hdr-left" onClick={() => toggle(G.id)}>
                <div className="hdr-title">{G.name || "Test"}</div>
              </div>

              <div className="hdr-right">
                {/* Retry All — โชว์เฉพาะมี failed */}
                {hasFailed && !allDone && (
                  <button
                    className="icon-btn"
                    onClick={() => handleRecoverAll(G.items)}
                    disabled={isRecoveringGroup}
                    title="Retry all failed videos"
                    style={{ color: "#f59e0b", borderColor: "#fde68a" }}
                  >
                    <RotateCcw size={15} style={isRecoveringGroup ? { animation: "spin 1s linear infinite" } : {}} />
                  </button>
                )}

                {allDone ? (
                  <CheckCircle2 size={18} className="ok-icon" />
                ) : (
                  <div className="hdr-count">
                    {G.items.filter((x) => x.status === "processed").length}/
                    {G.items.length}
                  </div>
                )}

                <button
                  className="icon-btn"
                  onClick={() => toggle(G.id)}
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>

                <button
                  className="icon-btn"
                  onClick={() => removeJobsByTestId(G.id)}
                  title="Dismiss this test from tray"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            {!isCollapsed && (
              <div className="progress-stack">
                {G.items.map((j) => {
                  const done = j.status === "processed";
                  const failed = j.status === "failed";
                  const isRec = !!recovering[j.id];
                  const errMsg = recoverError[j.id];
                  const pct = Math.round((j.progress || 0) * 100);

                  return (
                    <div key={j.id}>
                      <div
                        className={`progress-row${done ? " is-done" : ""}${failed ? " is-failed" : ""}`}
                      >
                        <div className="label">{j.mouseCode || j.label || j.id}</div>

                        <div className="bar">
                          <div className="fill" style={{ width: `${pct}%` }} />
                        </div>

                        {/* ปุ่ม Retry เฉพาะ failed */}
                        {failed && (
                          <button
                            className="icon-btn"
                            onClick={() => handleRecover(j)}
                            disabled={isRec}
                            title="Retry — recover result from analysis service"
                            style={{ color: "#f59e0b", borderColor: "#fde68a" }}
                          >
                            <RotateCcw
                              size={14}
                              style={isRec ? { animation: "spin 1s linear infinite" } : {}}
                            />
                          </button>
                        )}

                        {/* ปุ่ม Dismiss */}
                        <button
                          onClick={() => removeJob(j.id)}
                          className="icon-btn"
                          aria-label="Dismiss"
                          title="Dismiss"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Error message ใต้แถว */}
                      {errMsg && (
                        <div style={{
                          fontSize: 11,
                          color: "#b91c1c",
                          padding: "2px 4px 6px 4px",
                          lineHeight: 1.4,
                        }}>
                          {errMsg}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}