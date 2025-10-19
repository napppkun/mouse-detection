// components/ProgressTray.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useProgress } from "../context/ProgressCenter";
import { X, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { auth } from "../firebase";
import "../styles/app.css";

function useCollapsedState() {
  const [map, setMap] = useState({});
  // ผูกกับผู้ใช้ → แยก key ต่อ uid
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

  const setOpen = (groupId, open) =>
    setMap((prev) => ({ ...prev, [groupId]: !open ? true : false })); // ไม่ได้ใช้ตอนนี้ แต่เผื่อ

  return { collapsed: map, toggle, setOpen };
}

export default function ProgressTray() {
  const { jobs, removeJob, removeJobsByTestId } = useProgress();
  const { collapsed, toggle } = useCollapsedState();

  // จัดกลุ่มตาม testId (ไม่มี testId จะอยู่กลุ่ม “Ungrouped”)
  const groups = useMemo(() => {
    if (!jobs.length) return [];
    const g = new Map();
    for (const j of jobs) {
      const gid = j.testId || "__ungrouped__";
      if (!g.has(gid)) g.set(gid, { id: gid, name: j.testName || "Test", items: [] });
      const name = j.testName || g.get(gid).name || "Test";
      g.set(gid, { ...g.get(gid), name, items: [...g.get(gid).items, j] });
    }
    // เรียง: ยังไม่เสร็จไว้บน, เสร็จหมดแล้วไว้ล่าง
    return Array.from(g.values()).sort((a, b) => {
      const aDone = a.items.every((x) => x.status === "processed");
      const bDone = b.items.every((x) => x.status === "processed");
      return aDone === bDone ? 0 : aDone ? 1 : -1;
    });
  }, [jobs]);

  if (!jobs.length) {
    return null;
  }

  return (
    <div className="progress-tray right-bottom">
      {groups.map((G) => {
        const allDone = G.items.every((x) => x.status === "processed");
        const allTerminated = G.items.every((x) =>
          ["processed", "failed"].includes(x.status)
        );
        const isCollapsed = !!collapsed[G.id];

        return (
          <div key={G.id} className="progress-card-group">
            {/* Header */}
            <div className="progress-group-header">
              <div className="hdr-left" onClick={() => toggle(G.id)}>
                <div className="hdr-title">{G.name || "Test"}</div>
              </div>

              <div className="hdr-right">
                {/* ไอคอนสถานะรวม: ถ้าเสร็จทั้งหมดโชว์ติ๊ก, ถ้าไม่เสร็จโชว์ตัวนับ */}
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

                {/* dismiss กลุ่มได้เมื่อทุกตัวจบแล้ว (processed/failed) */}
                {allTerminated && (
                  <button
                    className="icon-btn"
                    onClick={() => removeJobsByTestId(G.id)}
                    title="Dismiss this test"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            {!isCollapsed && (
              <div className="progress-stack">
                {G.items.map((j) => {
                  const done = j.status === "processed";
                  const failed = j.status === "failed";
                  const pct = Math.round((j.progress || 0) * 100);
                  return (
                    <div key={j.id} className={`progress-row${done ? " is-done" : ""}${failed ? " is-failed" : ""}`}>
                      <div className="label">{j.mouseCode || j.label || j.id}</div>
                      <div className="bar">
                        <div className="fill" style={{ width: `${pct}%` }} />
                      </div>
                      {(done || failed) && (
                        <button
                          onClick={() => removeJob(j.id)}
                          className="icon-btn"
                          aria-label="Dismiss"
                          title="Dismiss"
                        >
                          <X size={14} />
                        </button>
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
