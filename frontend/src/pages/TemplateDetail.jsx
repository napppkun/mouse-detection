// src/pages/TemplateDetail.jsx
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { auth } from "../firebase";
import { ChevronLeft, Save, Upload, Trash2, Circle as CircleIcon } from "lucide-react";
import { getVideoContentBox } from "../lib/videoOverlay";
import "../styles/app.css";

const API_BASE = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

const MAZE_REGIONS = {
    ElevatedPlusMaze: [
        { type: "open_arm_1", color: "#22c55e", name: "Open Arm 1" },
        { type: "open_arm_2", color: "#22c55e", name: "Open Arm 2" },
        { type: "closed_arm_1", color: "#ef4444", name: "Closed Arm 1" },
        { type: "closed_arm_2", color: "#ef4444", name: "Closed Arm 2" },
    ],
    Ymaze: [
        { type: "A", color: "#22c55e", name: "Arm A" },
        { type: "B", color: "#ef4444", name: "Arm B" },
        { type: "C", color: "#3b82f6", name: "Arm C" },
    ],
    MorrisWaterMaze: [], // ใช้ ellipse
};

// วาด sector MWM (local space, origin = center)
const sectorPathLocal = (rx, ry, a1Deg, a2Deg) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const x1 = rx * Math.cos(toRad(a1Deg));
    const y1 = ry * Math.sin(toRad(a1Deg));
    const x2 = rx * Math.cos(toRad(a2Deg));
    const y2 = ry * Math.sin(toRad(a2Deg));
    const largeArc = (Math.abs((a2Deg - a1Deg + 360) % 360) > 180) ? 1 : 0;
    return `M 0 0 L ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} 1 ${x2} ${y2} Z`;
};
const Q_ANGLES = { Q1: [270, 360], Q2: [180, 270], Q3: [90, 180], Q4: [0, 90] };
const getAngles = (q) => Q_ANGLES[String(q).toUpperCase()] || Q_ANGLES.Q1;
const midAngleDeg = ([a1, a2]) => {
    let s = a1, e = a2; if (e <= s) e += 360; return (s + e) / 2;
};

export default function TemplateDetail() {
    const { testId: testIdFromParams } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const testId = location.state?.testId || testIdFromParams;
    const [testName, setTestName] = useState(location.state?.testName || "");
    const [behaviorTest, setBehaviorTest] = useState(location.state?.behaviorTest || "");
    const videoPairs = location.state?.videoPairs || [];
    const targetQuadrant = (location.state?.targetQuadrant || "Q1").toUpperCase();
    const [metaLoading, setMetaLoading] = useState(false);

    const isMWM = behaviorTest === "MorrisWaterMaze";
    const regionSpec = MAZE_REGIONS[behaviorTest] || [];

    // sample video
    const [sampleFile, setSampleFile] = useState(null);
    const [videoUrl, setVideoUrl] = useState("");

    // video refs
    const videoRef = useRef(null);
    const overlayRef = useRef(null);

    // rectangles (EPM / Y)
    const [rectangles, setRectangles] = useState([]); // [{id,x,y,width,height,rotation,type,color,name}]
    const [activeRegionType, setActiveRegionType] = useState(null);
    const [selectedRect, setSelectedRect] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const drawStartRef = useRef({ x: 0, y: 0 });
    const [currentDrawRect, setCurrentDrawRect] = useState(null);
    const drawRectRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeCorner, setResizeCorner] = useState(null); // 'nw'|'ne'|'se'|'sw'
    const [isRotating, setIsRotating] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // ellipse (MWM)
    const [ellipse, setEllipse] = useState(null); // {cx,cy,rx,ry,rotationDeg}
    const [tplDragMode, setTplDragMode] = useState(null);
    const [tplDragStart, setTplDragStart] = useState({ x: 0, y: 0 });

    // set limit time
    const [timeLimitSec, setTimeLimitSec] = useState("");

    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    // ถ้าไม่มี meta ใน state (หรือรีเฟรช) → ดึงจาก backend
    useEffect(() => {
        if (!testId) return;
        if (testName && behaviorTest) return; // มีครบแล้ว ไม่ต้องโหลด
        (async () => {
            try {
                setMetaLoading(true);
                const u = auth.currentUser; if (!u) throw new Error("Please log in");
                const idToken = await u.getIdToken(true);
                const res = await fetch(`${API_BASE}/api/tests/${testId}`, {
                    headers: { Authorization: `Bearer ${idToken}` },
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.message || "Failed to load test");
                const doc = json?.data || json;
                setTestName(doc?.name || "");
                setBehaviorTest(doc?.behaviorTest || "");
            } catch (e) {
                // ให้ยังใช้งานได้แม้โหลด meta ไม่สำเร็จ
                console.error(e);
            } finally {
                setMetaLoading(false);
            }
        })();
    }, [testId, testName, behaviorTest]);

    useEffect(() => {
        if (sampleFile) {
            const u = URL.createObjectURL(sampleFile);
            setVideoUrl(u);
            return () => URL.revokeObjectURL(u);
        }
    }, [sampleFile]);

    const onChooseFiles = (e) => {
        const fs = Array.from(e.target.files || []).filter(f => f.type.startsWith("video/"));
        if (!fs.length) return;
        setSampleFile(fs[0]);
    };

    useEffect(() => {
        if (!testId || !behaviorTest) return;

        (async () => {
            try {
                const u = auth.currentUser;
                if (!u) return;
                const idToken = await u.getIdToken(true);

                const res = await fetch(`${API_BASE}/api/templates/by-test/${testId}`, {
                    headers: { Authorization: `Bearer ${idToken}` },
                });
                const json = await res.json();
                if (!res.ok || !json?.success || !json?.data) return;

                const tpl = json.data;

                if (tpl.behaviorTest === "MorrisWaterMaze" && tpl.ellipse) {
                    setEllipse(tpl.ellipse);
                    setRectangles([]);
                } else if (Array.isArray(tpl.rectangles)) {
                    const rebuilt = tpl.rectangles.map((r, idx) => {
                        const spec = regionSpec.find(x => x.type === r.type);
                        return {
                            id: Date.now() + idx,
                            x: r.x,
                            y: r.y,
                            width: r.width,
                            height: r.height,
                            rotation: r.rotation || 0,
                            type: r.type,
                            color: spec?.color || "#0ea5e9",
                            name: spec?.name || r.type,
                        };
                    });
                    setRectangles(rebuilt);
                    setEllipse(null);
                }

                setTimeLimitSec(
                    tpl?.analysisConfig?.timeLimitSec != null
                        ? String(tpl.analysisConfig.timeLimitSec)
                        : ""
                );
            } catch (e) {
                console.error("load template error:", e);
            }
        })();
    }, [testId, behaviorTest]);

    // บังคับให้ component re-render เมื่อวิดีโอพร้อม/มีการย่อ–ขยาย
    const [, forceTick] = useState(0);

    useEffect(() => {
        const handler = () => forceTick(t => t + 1);
        const v = videoRef.current;

        // เมื่อวิดีโอโหลด dimension เสร็จ
        if (v) {
            v.addEventListener("loadedmetadata", handler);
            v.addEventListener("loadeddata", handler);
        }

        // เวลาเปลี่ยนขนาดหน้าจอ หรือ container เปลี่ยนขนาด
        window.addEventListener("resize", handler);

        return () => {
            if (v) {
                v.removeEventListener("loadedmetadata", handler);
                v.removeEventListener("loadeddata", handler);
            }
            window.removeEventListener("resize", handler);
        };
    }, []);


    // ───────────────────────── Rectangles draw (EPM/Y) ─────────────────────────
    const onOverlayMouseDown = (e) => {
        const v = videoRef.current; if (!v || !v.videoWidth) return;

        if (isMWM) {
            // ellipse create/move
            const box = getVideoContentBox(v);
            const vx = Math.max(0, Math.min((e.clientX - box.left) / box.scaleX, v.videoWidth));
            const vy = Math.max(0, Math.min((e.clientY - box.top) / box.scaleY, v.videoHeight));
            if (!ellipse) {
                const r0 = Math.min(v.videoWidth, v.videoHeight) / 4;
                setEllipse({ cx: vx, cy: vy, rx: r0, ry: r0, rotationDeg: 0 });
                setError("");
                return;
            }
            // inside?
            const ang = (ellipse.rotationDeg || 0) * Math.PI / 180;
            const dx = vx - ellipse.cx, dy = vy - ellipse.cy;
            const lx = Math.cos(ang) * dx + Math.sin(ang) * dy;
            const ly = -Math.sin(ang) * dx + Math.cos(ang) * dy;
            const inside = (lx * lx) / (ellipse.rx * ellipse.rx) + (ly * ly) / (ellipse.ry * ellipse.ry) <= 1;
            if (inside) {
                setTplDragMode("move");
                setTplDragStart({ x: vx, y: vy });
            }
            return;
        }

        // rectangles
        if (e.target.getAttribute("data-el") !== "overlay") return;

        const used = new Set(rectangles.map(r => r.type));
        let targetType = activeRegionType;
        if (!targetType) {
            const next = regionSpec.find(r => !used.has(r.type));
            targetType = next?.type || null;
        }
        if (!targetType) { setError("All regions are defined"); return; }
        if (used.has(targetType)) {
            setError("This region is already defined. Select it to edit or delete.");
            return;
        }

        const box = getVideoContentBox(v);
        const vx = Math.max(0, Math.min((e.clientX - box.left) / box.scaleX, v.videoWidth));
        const vy = Math.max(0, Math.min((e.clientY - box.top) / box.scaleY, v.videoHeight));
        drawStartRef.current = { x: vx, y: vy };
        setIsDrawing(true);
        const initRect = { x: vx, y: vy, width: 0, height: 0 };
        setCurrentDrawRect(initRect);
        drawRectRef.current = initRect;
        setError("");
    };

    const onRectMouseDown = (e, id, action = "move", corner = null) => {
        e.stopPropagation(); e.preventDefault();
        setSelectedRect(id);
        const v = videoRef.current; if (!v) return;
        const box = getVideoContentBox(v);
        const startVX = (e.clientX - box.left) / box.scaleX;
        const startVY = (e.clientY - box.top) / box.scaleY;
        setDragStart({ x: startVX, y: startVY });

        if (action === "move") setIsDragging(true);
        else if (action === "resize") { setResizeCorner(corner || "se"); setIsResizing(true); }
        else if (action === "rotate") setIsRotating(true);
    };

    useEffect(() => {
        const mv = (e) => {
            const v = videoRef.current; if (!v) return;

            // ellipse dragging/resizing/rotating
            if (isMWM && ellipse && tplDragMode) {
                const box = getVideoContentBox(v);
                const vx = (e.clientX - box.left) / box.scaleX;
                const vy = (e.clientY - box.top) / box.scaleY;
                if (tplDragMode === "move") {
                    const dx = vx - tplDragStart.x, dy = vy - tplDragStart.y;
                    setEllipse({
                        ...ellipse,
                        cx: Math.max(0, Math.min(v.videoWidth, ellipse.cx + dx)),
                        cy: Math.max(0, Math.min(v.videoHeight, ellipse.cy + dy)),
                    });
                    setTplDragStart({ x: vx, y: vy });
                } else if (tplDragMode === "resizeX" || tplDragMode === "resizeY") {
                    const ang = (ellipse.rotationDeg || 0) * Math.PI / 180;
                    const dx = vx - ellipse.cx;
                    const dy = vy - ellipse.cy;
                    if (tplDragMode === "resizeX") {
                        const proj = dx * Math.cos(ang) + dy * Math.sin(ang);
                        setEllipse({ ...ellipse, rx: Math.max(10, Math.abs(proj)) });
                    } else {
                        const proj = -dx * Math.sin(ang) + dy * Math.cos(ang);
                        setEllipse({ ...ellipse, ry: Math.max(10, Math.abs(proj)) });
                    }
                } else if (tplDragMode === "rotate") {
                    const ang = Math.atan2(vy - ellipse.cy, vx - ellipse.cx) * (180 / Math.PI);
                    setEllipse({ ...ellipse, rotationDeg: ang });
                }
                return;
            }

            // drawing new rect
            if (!isMWM && isDrawing && currentDrawRect) {
                const box = getVideoContentBox(v);
                const vx = Math.max(0, Math.min((e.clientX - box.left) / box.scaleX, v.videoWidth));
                const vy = Math.max(0, Math.min((e.clientY - box.top) / box.scaleY, v.videoHeight));
                const s = drawStartRef.current;
                const w = Math.abs(vx - s.x), h = Math.abs(vy - s.y);
                const x = Math.min(s.x, vx), y = Math.min(s.y, vy);
                const rectNow = { x, y, width: w, height: h };
                setCurrentDrawRect(rectNow);
                drawRectRef.current = rectNow;
            }

            // --- move/resize/rotate rectangles ---
            if (!isMWM && (isDragging || isResizing || isRotating) && selectedRect) {
                const v = videoRef.current; if (!v) return;
                const box = getVideoContentBox(v);
                const clickVX = (e.clientX - box.left) / box.scaleX;
                const clickVY = (e.clientY - box.top) / box.scaleY;

                const sel = rectangles.find((r) => r.id === selectedRect);
                if (!sel) return;

                if (isDragging || isResizing) {
                    const dx = clickVX - dragStart.x;
                    const dy = clickVY - dragStart.y;

                    if (isDragging) {
                        const nx = Math.max(0, Math.min(v.videoWidth - sel.width, sel.x + dx));
                        const ny = Math.max(0, Math.min(v.videoHeight - sel.height, sel.y + dy));
                        setRectangles(prev => prev.map(r => r.id === sel.id ? { ...r, x: nx, y: ny } : r));
                    } else {
                        let nx = sel.x, ny = sel.y, nw = sel.width, nh = sel.height;
                        const minW = 20, minH = 20;
                        if (resizeCorner === "se") { nw = Math.max(minW, sel.width + dx); nh = Math.max(minH, sel.height + dy); }
                        else if (resizeCorner === "ne") { nw = Math.max(minW, sel.width + dx); nh = Math.max(minH, sel.height - dy); ny = sel.y + sel.height - nh; }
                        else if (resizeCorner === "sw") { nw = Math.max(minW, sel.width - dx); nh = Math.max(minH, sel.height + dy); nx = sel.x + sel.width - nw; }
                        else if (resizeCorner === "nw") { nw = Math.max(minW, sel.width - dx); nh = Math.max(minH, sel.height - dy); nx = sel.x + sel.width - nw; ny = sel.y + sel.height - nh; }
                        // clamp
                        if (nx < 0) { nw += nx; nx = 0; }
                        if (ny < 0) { nh += ny; ny = 0; }
                        if (nx + nw > v.videoWidth) nw = v.videoWidth - nx;
                        if (ny + nh > v.videoHeight) nh = v.videoHeight - ny;

                        setRectangles(prev => prev.map(r => r.id === sel.id ? { ...r, x: nx, y: ny, width: nw, height: nh } : r));
                    }
                    setDragStart({ x: clickVX, y: clickVY });
                    return;
                }

                if (isRotating) {
                    const cx = sel.x + sel.width / 2;
                    const cy = sel.y + sel.height / 2;
                    let angle = Math.atan2(clickVY - cy, clickVX - cx) * (180 / Math.PI);
                    if (e.shiftKey) angle = Math.round(angle / 15) * 15; // snap 15°
                    setRectangles(prev => prev.map(r => r.id === sel.id ? { ...r, rotation: angle } : r));
                    return;
                }
            }
        };

        const up = () => {
            if (!isMWM && isDrawing && drawRectRef.current && drawStartRef.current) {
                const { x, y, width, height } = drawRectRef.current;
                if (width >= 5 && height >= 5) {
                    const used = new Set(rectangles.map(rr => rr.type));
                    const chosen = activeRegionType || (regionSpec.find(r => !used.has(r.type))?.type);
                    const info = regionSpec.find(r => r.type === chosen && !used.has(r.type));
                    if (info) {
                        const newRect = { id: Date.now(), x, y, width, height, rotation: 0, type: info.type, color: info.color, name: info.name };
                        setRectangles(prev => [...prev, newRect]);
                        setSelectedRect(newRect.id);
                        setActiveRegionType(null);
                        setError("");
                    }
                }
            }
            setIsDrawing(false);
            setCurrentDrawRect(null);
            drawRectRef.current = null;
            setTplDragMode(null);
            setIsDragging(false);
            setIsResizing(false);
            setResizeCorner(null);
            setIsRotating(false);
        };

        document.addEventListener("mousemove", mv);
        document.addEventListener("mouseup", up);
        return () => {
            document.removeEventListener("mousemove", mv);
            document.removeEventListener("mouseup", up);
        };
    }, [
        isMWM, ellipse, tplDragMode,
        isDrawing, currentDrawRect,
        rectangles, activeRegionType, regionSpec,
        isDragging, isResizing, isRotating,
        selectedRect, dragStart
    ]);

    const deleteSelectedRect = () => {
        setRectangles(prev => prev.filter(r => r.id !== selectedRect));
        setSelectedRect(null);
    };

    // ───────────────────────── Save template ─────────────────────────
    const onSaveTemplate = async () => {
        if (!testId) { setError("Missing testId"); return; }
        if (isMWM) {
            if (!ellipse) { setError("Please place the ellipse template."); return; }
        } else {
            if ((rectangles || []).length !== (regionSpec || []).length) {
                setError(`Please define all regions (${(rectangles || []).length}/${(regionSpec || []).length}).`);
                return;
            }
        }
        if (timeLimitSec !== "" && (!Number.isFinite(Number(timeLimitSec)) || Number(timeLimitSec) <= 0)) {
            setError("Time limit must be a positive number.");
            return;
        }

        setSaving(true);
        try {
            const u = auth.currentUser; if (!u) throw new Error("Please log in");
            const idToken = await u.getIdToken(true);

            const body = {
                testId,
                behaviorTest,
                ...(isMWM
                    ? {
                        ellipse: {
                            cx: Math.round(ellipse.cx), cy: Math.round(ellipse.cy),
                            rx: Math.round(ellipse.rx), ry: Math.round(ellipse.ry),
                            rotationDeg: Math.round(ellipse.rotationDeg || 0),
                        }
                    }
                    : {
                        rectangles: rectangles.map(r => ({
                            type: r.type,
                            x: Math.round(r.x), y: Math.round(r.y),
                            width: Math.round(r.width), height: Math.round(r.height),
                            rotation: Math.round(r.rotation || 0),
                        }))
                    }),
                analysisConfig: {
                    timeLimitSec: timeLimitSec === "" ? undefined : Number(timeLimitSec),
                },
            };

            const res = await fetch(`${API_BASE}/api/templates`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.message || "Save template failed");

            // ไปหน้า EditVideo
            navigate(`/edit-video/${testId}`, {
                replace: true,
                state: {
                    fromTemplate: true,
                    testId,
                    behaviorTest,
                    testName,
                    videoPairs,
                    targetQuadrant,
                },
            });
        } catch (e) {
            setError(e?.message || "Save template failed");
        } finally {
            setSaving(false);
        }
    };

    // ───────────────────────── Render ─────────────────────────
    return (
        <div className="app-main">
            <div className="card" style={{ width: "100%", maxWidth: 860 }}>
                <h3 style={{ marginTop: 0 }}>Template for {behaviorTest}</h3>

                <div className="muted" style={{ marginTop: -4, marginBottom: 8 }}>
                    Test: <strong>{testName || "—"}</strong>
                </div>

                {error && <div className="alert danger">{error}</div>}

                <div className="form-row onecol">
                    <label
                        className="btn"
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                    >
                        <Upload size={16} />
                        Choose a sample video
                        <input type="file" accept="video/*" hidden onChange={onChooseFiles} />
                    </label>
                    <div className="muted" style={{ marginTop: 6 }}>
                        You can define the template on any sample video; it will be applied to all videos in this test.
                    </div>
                </div>

                <div style={{ position: "relative", marginTop: 12 }}>
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full"
                        style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--border)", background: "#000", maxHeight: 420, objectFit: "contain" }}
                        controls
                    />

                    {/* Overlay */}
                    <div
                        ref={overlayRef}
                        data-el="overlay"
                        onMouseDown={onOverlayMouseDown}
                        style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 20,                // ดันให้ทับทุกอย่างแน่ๆ
                            cursor: isMWM ? "default" : (activeRegionType ? "crosshair" : "default"),
                        }}
                    >
                        {(() => {
                            const v = videoRef.current; if (!v || !v.videoWidth) return null;
                            const container = overlayRef.current?.getBoundingClientRect(); if (!container) return null;
                            const box = getVideoContentBox(v);
                            const left = box.left - container.left, top = box.top - container.top;
                            const sx = box.scaleX, sy = box.scaleY;

                            // ---------- MWM ----------
                            if (isMWM && ellipse) {
                                const scx = left + ellipse.cx * sx;
                                const scy = top + ellipse.cy * sy;
                                const rxS = ellipse.rx * sx;
                                const ryS = ellipse.ry * sy;
                                const deg = ellipse.rotationDeg || 0;
                                const vw = container.width, vh = container.height;

                                return (
                                    <svg
                                        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
                                        width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`}
                                    >
                                        <g transform={`translate(${scx} ${scy}) rotate(${deg})`}>
                                            {/* target sector */}
                                            {(() => {
                                                const [a1, a2] = getAngles(targetQuadrant);
                                                return (
                                                    <path
                                                        d={sectorPathLocal(rxS, ryS, a1, a2)}
                                                        fill="#0ea5e9" fillOpacity="0.40" pointerEvents="none"
                                                    />
                                                );
                                            })()}
                                            {/* ellipse body (ให้ pointerEvents ที่ตัวนี้เท่านั้น) */}
                                            <ellipse
                                                cx={0} cy={0} rx={rxS} ry={ryS}
                                                fill="none" stroke="#0ea5e9" strokeWidth="2"
                                                style={{ cursor: "move", pointerEvents: "all" }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    const b = getVideoContentBox(videoRef.current);
                                                    const vx = (e.clientX - b.left) / b.scaleX;
                                                    const vy = (e.clientY - b.top) / b.scaleY;
                                                    setTplDragMode("move");
                                                    setTplDragStart({ x: vx, y: vy });
                                                }}
                                            />
                                            <line x1={-rxS} y1={0} x2={rxS} y2={0} stroke="#0ea5e9" strokeWidth="1.5" />
                                            <line x1={0} y1={-ryS} x2={0} y2={ryS} stroke="#0ea5e9" strokeWidth="1.5" />
                                            <circle cx={rxS} cy={0} r="6" fill="#0ea5e9" style={{ cursor: "ew-resize", pointerEvents: "all" }}
                                                onMouseDown={() => setTplDragMode("resizeX")} />
                                            <circle cx={0} cy={-ryS} r="6" fill="#0ea5e9" style={{ cursor: "ns-resize", pointerEvents: "all" }}
                                                onMouseDown={() => setTplDragMode("resizeY")} />
                                            <line x1={0} y1={-ryS} x2={0} y2={-ryS - 24} stroke="#0ea5e9" strokeDasharray="4,4" strokeWidth="1" />
                                            <circle cx={0} cy={-ryS - 24} r="6" fill="#0ea5e9" style={{ cursor: "crosshair", pointerEvents: "all" }}
                                                onMouseDown={() => setTplDragMode("rotate")} />
                                            {/* labels */}
                                            {["Q1", "Q2", "Q3", "Q4"].map(q => {
                                                const m = (midAngleDeg(getAngles(q)) * Math.PI) / 180;
                                                const lx = 0.55 * rxS * Math.cos(m);
                                                const ly = 0.55 * ryS * Math.sin(m);
                                                const isT = q === targetQuadrant;
                                                const common = { textAnchor: "middle", fontSize: 12, fill: "#fff", stroke: "#0f172a", strokeWidth: 1, paintOrder: "stroke", pointerEvents: "none" };
                                                return isT ? (
                                                    <g key={q} transform={`translate(${lx} ${ly})`}>
                                                        <text {...common} y={-8}>target</text>
                                                        <text {...common} y={8}>{q}</text>
                                                    </g>
                                                ) : (
                                                    <text key={q} {...common} x={lx} y={ly + 4}>{q}</text>
                                                );
                                            })}
                                        </g>
                                    </svg>
                                );
                            }

                            // ---------- EPM / Y ----------
                            const vw = container.width, vh = container.height;
                            const toScreen = (vx, vy) => ({ x: left + vx * sx, y: top + vy * sy });

                            return (
                                <>
                                    {/* วาดสี่เหลี่ยมทั้งหมด */}
                                    {!!rectangles.length && (
                                        <svg
                                            style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
                                            width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`}
                                        >
                                            {rectangles.map((r) => {
                                                const p = toScreen(r.x, r.y);
                                                const w = r.width * sx, h = r.height * sy;
                                                const cx = p.x + w / 2, cy = p.y + h / 2;
                                                const rot = (r.rotation || 0) * Math.PI / 180;
                                                const rotPt = (x, y) => {
                                                    const dx = x - cx, dy = y - cy;
                                                    return {
                                                        x: cx + dx * Math.cos(rot) - dy * Math.sin(rot),
                                                        y: cy + dx * Math.sin(rot) + dy * Math.cos(rot)
                                                    };
                                                };
                                                const corners = [
                                                    { x: p.x, y: p.y }, { x: p.x + w, y: p.y },
                                                    { x: p.x + w, y: p.y + h }, { x: p.x, y: p.y + h },
                                                ].map(c => rotPt(c.x, c.y));
                                                const d = `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`;
                                                return (
                                                    <g key={r.id} style={{ pointerEvents: "all" }}>
                                                        {/* ค่าที่ใช้ร่วมกัน */}
                                                        {(() => {
                                                            const p = toScreen(r.x, r.y);
                                                            const w = r.width * sx, h = r.height * sy;
                                                            const cx = p.x + w / 2, cy = p.y + h / 2;
                                                            const rotDeg = r.rotation || 0;
                                                            const rotRad = (rotDeg * Math.PI) / 180;

                                                            const rotPt = (x, y) => {
                                                                const dx = x - cx, dy = y - cy;
                                                                return {
                                                                    x: cx + dx * Math.cos(rotRad) - dy * Math.sin(rotRad),
                                                                    y: cy + dx * Math.sin(rotRad) + dy * Math.cos(rotRad),
                                                                };
                                                            };

                                                            // มุมทั้ง 4 หลังหมุน
                                                            const corners = [
                                                                { x: p.x, y: p.y },
                                                                { x: p.x + w, y: p.y },
                                                                { x: p.x + w, y: p.y + h },
                                                                { x: p.x, y: p.y + h },
                                                            ].map(c => rotPt(c.x, c.y));

                                                            const d = `M ${corners[0].x} ${corners[0].y}
               L ${corners[1].x} ${corners[1].y}
               L ${corners[2].x} ${corners[2].y}
               L ${corners[3].x} ${corners[3].y} Z`;

                                                            // จุดบนกลางกรอบ + จุดหมุน
                                                            const topMid = rotPt((p.x + p.x + w) / 2, p.y);
                                                            const rotHandle = { x: topMid.x, y: topMid.y - 24 };

                                                            const isSel = selectedRect === r.id;
                                                            const stroke = r.color || "#0ea5e9";
                                                            const hs = 6;

                                                            const cursorForCorner = (name) =>
                                                                name === "ne" || name === "sw" ? "nesw-resize" : "nwse-resize";

                                                            return (
                                                                <>
                                                                    {/* label */}
                                                                    <text
                                                                        x={cx} y={cy - 10}
                                                                        textAnchor="middle" fontSize="12"
                                                                        fill="#fff" stroke="#0f172a" strokeWidth="1" paintOrder="stroke"
                                                                        style={{ pointerEvents: "none" }}
                                                                    >
                                                                        {r.name || r.type}
                                                                    </text>

                                                                    {/* ตัวกรอบ */}
                                                                    <path
                                                                        d={d}
                                                                        fill={stroke}
                                                                        fillOpacity={isSel ? 0.12 : 0.08}
                                                                        stroke={stroke}
                                                                        strokeWidth={isSel ? 2.5 : 1.8}
                                                                        vectorEffect="non-scaling-stroke"
                                                                        onMouseDown={(e) => onRectMouseDown(e, r.id, "move")}
                                                                        style={{ cursor: "move", pointerEvents: "all" }}
                                                                    />

                                                                    {/* เส้นประเมื่อถูกเลือก (ครั้งเดียวพอ) */}
                                                                    {isSel && (
                                                                        <path
                                                                            d={d}
                                                                            fill="none"
                                                                            stroke="#ffffffcc"
                                                                            strokeWidth="1"
                                                                            strokeDasharray="5,4"
                                                                            vectorEffect="non-scaling-stroke"
                                                                            pointerEvents="none"
                                                                        />
                                                                    )}

                                                                    {/* แสดง handles เฉพาะตอนเลือก */}
                                                                    {isSel && (
                                                                        <>
                                                                            {/* handles 4 มุม */}
                                                                            {[
                                                                                { name: "nw", x: p.x, y: p.y },
                                                                                { name: "ne", x: p.x + w, y: p.y },
                                                                                { name: "se", x: p.x + w, y: p.y + h },
                                                                                { name: "sw", x: p.x, y: p.y + h },
                                                                            ].map((c) => {
                                                                                const rr = rotPt(c.x, c.y);
                                                                                return (
                                                                                    <rect
                                                                                        key={c.name}
                                                                                        x={rr.x - hs}
                                                                                        y={rr.y - hs}
                                                                                        width={hs * 2}
                                                                                        height={hs * 2}
                                                                                        fill={stroke}
                                                                                        stroke="#fff"
                                                                                        strokeWidth="1"
                                                                                        onMouseDown={(e) => onRectMouseDown(e, r.id, "resize", c.name)}
                                                                                        style={{ cursor: cursorForCorner(c.name), pointerEvents: "all" }}
                                                                                    />
                                                                                );
                                                                            })}

                                                                            {/* rotate handle */}
                                                                            <line
                                                                                x1={topMid.x} y1={topMid.y}
                                                                                x2={rotHandle.x} y2={rotHandle.y}
                                                                                stroke={stroke} strokeDasharray="4,4" strokeWidth="1"
                                                                                pointerEvents="none"
                                                                            />
                                                                            <circle
                                                                                cx={rotHandle.x} cy={rotHandle.y} r="7"
                                                                                fill={stroke} stroke="#fff" strokeWidth="1"
                                                                                onMouseDown={(e) => onRectMouseDown(e, r.id, "rotate")}
                                                                                style={{ cursor: "crosshair", pointerEvents: "all" }}
                                                                            />
                                                                        </>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    )}

                                    {/* เส้นพรีวิวขณะกำลังวาด */}
                                    {isDrawing && currentDrawRect && (
                                        <svg
                                            style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
                                            width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`}
                                        >
                                            <rect
                                                x={left + currentDrawRect.x * sx}
                                                y={top + currentDrawRect.y * sy}
                                                width={currentDrawRect.width * sx}
                                                height={currentDrawRect.height * sy}
                                                fill="none"
                                                stroke={(regionSpec.find(rr => rr.type === activeRegionType)?.color) || "#0ea5e9"}
                                                strokeDasharray="5,5"
                                                strokeWidth="2.5"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                        </svg>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                </div>

                {/* Toolbar */}
                <div className="toolbar" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                    {isMWM ? (
                        <div className="btn-group" style={{ gap: 8 }}>
                            <button className="btn" onClick={() => setEllipse(null)}>
                                <Trash2 size={16} /> <span style={{ marginLeft: 6 }}>Remove Ellipse</span>
                            </button>
                            <div className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <CircleIcon size={16} /> Click to create, drag to move; side/top handles to resize; top handle to rotate.
                            </div>
                        </div>
                    ) : (
                        <div className="grid-helpers" style={{ flex: 1 }}>
                            {regionSpec.map((r, idx) => {
                                const rect = rectangles.find(rr => rr.type === r.type);
                                const isDefined = !!rect;
                                const isSelected = rect && selectedRect === rect.id;
                                const isActiveToDraw = !isDefined && activeRegionType === r.type;
                                return (
                                    <button
                                        key={r.type}
                                        type="button"
                                        className={`helper-chip ${isSelected ? "is-selected" : ""} ${isActiveToDraw ? "is-active" : ""}`}
                                        onClick={() => {
                                            if (rect) {
                                                setSelectedRect(rect.id);
                                                setActiveRegionType(null);
                                            } else {
                                                setSelectedRect(null);
                                                setActiveRegionType(r.type);
                                                setError(`Click on video to draw ${r.name}`);
                                            }
                                        }}
                                        title={isDefined ? "Click to select" : "Click, then draw on the video"}
                                    >
                                        <span className="chip-dot" style={{ borderColor: r.color }} />
                                        {idx + 1}. {r.name} {isDefined ? "✓" : isActiveToDraw ? "(selected to draw)" : ""}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {!isMWM && (
                        <div className="btn-group" style={{ marginLeft: "auto", gap: 8 }}>
                            <button className="btn" onClick={() => setSelectedRect(null)}>Deselect</button>
                            <button className="btn danger" disabled={!selectedRect} onClick={deleteSelectedRect}>
                                <Trash2 size={16} /> Delete
                            </button>
                        </div>
                    )}
                </div>

                <div className="form-row onecol" style={{ marginTop: 12 }}>
                    <label>Time Limit (seconds)</label>
                    <div className="input-group">
                        <input
                            type="number"
                            className="input"
                            min="1"
                            step="1"
                            value={timeLimitSec}
                            onChange={(e) => setTimeLimitSec(e.target.value)}
                            placeholder={isMWM ? "e.g. 60" : "e.g. 300"}
                        />
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                        This limit will be applied to all videos in this test during analysis.
                    </div>
                </div>

                <div className="btn-group" style={{ justifyContent: "space-between", marginTop: 16 }}>
                    <button className="btn" onClick={() => navigate(-1)}><ChevronLeft size={16} /> Back</button>
                    <button className={`btn primary ${saving ? "is-loading" : ""}`} onClick={onSaveTemplate} disabled={saving}>
                        <Save size={16} /> Save Template
                    </button>
                </div>
            </div>
        </div >
    );
}
