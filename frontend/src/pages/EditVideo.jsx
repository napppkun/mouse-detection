// src/pages/EditVideo.jsx
import { Play, Pause, Trash2, Send, Square, Circle as CircleIcon, RotateCw } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { auth } from "../firebase";
import { useProgress } from "../context/ProgressCenter";
import "../styles/app.css";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";
const ANALYSIS_API = window._env_?.ANALYSIS_API || process.env.ANALYSIS_API || "http://127.0.0.1:8000";

const MAZE_TO_SERVICE = {
  ElevatedPlusMaze: "epm",
  Ymaze: "ymaze",
  MorrisWaterMaze: "mwm",
};

// viewport→video content box (object-fit: contain)
function getVideoContentBox(videoEl) {
  const vw = videoEl.videoWidth || 0;
  const vh = videoEl.videoHeight || 0;
  const r = videoEl.getBoundingClientRect();
  if (!vw || !vh || !r.width || !r.height) {
    return { left: r.left, top: r.top, width: r.width, height: r.height, scaleX: 1, scaleY: 1 };
  }
  const videoAR = vw / vh;
  const elemAR = r.width / r.height;
  let contentW, contentH, offsetX, offsetY;
  if (elemAR > videoAR) {
    contentH = r.height; contentW = contentH * videoAR; offsetX = (r.width - contentW) / 2; offsetY = 0;
  } else {
    contentW = r.width; contentH = contentW / videoAR; offsetX = 0; offsetY = (r.height - contentH) / 2;
  }
  return {
    left: r.left + offsetX,
    top: r.top + offsetY,
    width: contentW,
    height: contentH,
    scaleX: contentW / vw,
    scaleY: contentH / vh,
  };
}

export default function EditVideo() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addJobs } = useProgress();

  const normalizeBehavior = (v = "") => {
    const s = String(v).trim().toLowerCase();
    if (["mwm", "morris water maze", "morriswatermaze"].includes(s)) return "MorrisWaterMaze";
    if (["epm", "elevated plus maze", "elevatedplusmaze"].includes(s)) return "ElevatedPlusMaze";
    if (["y-maze", "y maze", "ymaze"].includes(s)) return "Ymaze";
    return v || "ElevatedPlusMaze";
  };

  const {
    videoUrl: initialVideoUrl,
    mazeType: mazeTypeRaw,
    rectangles: initialRectangles = {},
    videoPairs = [],
    testName = "",
    targetQuadrant = "Q1",
    behaviorTest,
  } = location.state || {};

  const mazeType = normalizeBehavior(mazeTypeRaw ?? behaviorTest);

  // ── Shared state
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl || "");
  const [rectangles, setRectangles] = useState(initialRectangles);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [durations, setDurations] = useState({});

  // ── Rectangles (EPM/Y)
  const [isDrawMode, setIsDrawMode] = useState(true);
  const [activeRegionType, setActiveRegionType] = useState(null);
  const [selectedRect, setSelectedRect] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentDrawRect, setCurrentDrawRect] = useState(null);

  // ── Ellipse template (MWM)
  const [mwmTemplates, setMwmTemplates] = useState({}); // {key: {cx,cy,rx,ry,rotationDeg}}
  const [mwmToolOn, setMwmToolOn] = useState(mazeType === "MorrisWaterMaze");
  const [tplDragMode, setTplDragMode] = useState(null); // 'move'|'resizeX'|'resizeY'|'rotate'
  const [tplDragStart, setTplDragStart] = useState({ x: 0, y: 0 });

  // ── Trim drag
  const [isTrimDragging, setIsTrimDragging] = useState(false);
  const [trimDragType, setTrimDragType] = useState(null);
  const [trims, setTrims] = useState({});
  const trimsRef = useRef(trims);
  useEffect(() => { trimsRef.current = trims; }, [trims]);

  const MAX_WINDOW = mazeType === "MorrisWaterMaze" ? 60 : 300;

  // ── Refs
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const drawStartRef = useRef({ x: 0, y: 0 });
  const pendingTypeRef = useRef(null);
  const drawRectRef = useRef(null);
  const loadedOkRef = useRef(false);

  // ── Region specs (UI chips for EPM/Y)
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
    // สำหรับ MWM เราจะไม่ใช้ rect อีกต่อไป (แสดงเพื่อคุมปุ่มนับชิ้นเท่านั้น)
    MorrisWaterMaze: [
      { type: "quadrant_1", color: "#3b82f6", name: "Quadrant 1" },
      { type: "quadrant_2", color: "#eab308", name: "Quadrant 2" },
      { type: "quadrant_3", color: "#22c55e", name: "Quadrant 3" },
      { type: "quadrant_4", color: "#ef4444", name: "Quadrant 4" },
    ],
  };
  const regionSpec = MAZE_REGIONS[mazeType] || [];

  // ── Helpers for current video/template/rectangles
  const currentVideo = useMemo(
    () => (videoPairs?.length ? videoPairs[currentVideoIndex] || videoPairs[0] : null),
    [videoPairs, currentVideoIndex]
  );
  const curVidId = currentVideo?.videoId || currentVideo?._id;
  const keyForIndex = (idx) => {
    const cur = videoPairs[idx];
    return cur ? `${idx}-${cur.mouseCode}` : `idx-${idx}`;
  };
  const key = keyForIndex(currentVideoIndex);

  const getCurrentRectangles = () => rectangles[key] || [];
  const setCurrentRectangles = (arr) => setRectangles((p) => ({ ...p, [key]: arr }));

  const getCurrentTemplate = () => mwmTemplates[key] || null;
  const setCurrentTemplate = (tpl) => setMwmTemplates((p) => ({ ...p, [key]: tpl }));

  const hasTemplateNow = mazeType === "MorrisWaterMaze" && !!getCurrentTemplate();

  // ต้องมี “template” สำหรับทุกวิดีโอ ถ้าเป็น MWM (เลิกใช้ rect)
  const allConfigured = useMemo(() => {
    if (!videoPairs?.length) return false;
    if (mazeType !== "MorrisWaterMaze") {
      return videoPairs.every((_, idx) => (rectangles[keyForIndex(idx)] || []).length === regionSpec.length);
    }
    return videoPairs.every((_, idx) => !!mwmTemplates[keyForIndex(idx)]);
  }, [videoPairs, rectangles, mwmTemplates, regionSpec.length, mazeType]);

  // ── Load video URL
  useEffect(() => {
    loadedOkRef.current = false;
    if (currentVideo?.video) {
      const url = URL.createObjectURL(currentVideo.video);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (currentVideo?.serverUrl) {
      setVideoUrl(currentVideo.serverUrl);
      return;
    }
    if (!initialVideoUrl && !videoUrl) setError("No video found. Please go back and upload a video.");
  }, [currentVideoIndex, videoPairs]); // eslint-disable-line

  // ── Duration/metadata + default trims
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => {
      loadedOkRef.current = true;
      setError("");
      const dur = v.duration || 0;
      setDuration(dur);
      if (curVidId) setDurations((p) => ({ ...p, [curVidId]: dur }));

      const fixed = mazeType === "MorrisWaterMaze" ? 60 : 300;
      const defaultEnd = fixed && dur > 0 ? Math.min(fixed, dur) : fixed || dur;

      const saved = trimsRef.current[curVidId];
      const start = saved?.start ?? 0;
      const end = saved?.end ?? defaultEnd;

      setTrimStart(start);
      setTrimEnd(end);
      if (curVidId && !saved) setTrims((prev) => ({ ...prev, [curVidId]: { start, end } }));

      // debug env
      // eslint-disable-next-line no-console
      console.debug("[VIDEO meta]", { vw: v.videoWidth, vh: v.videoHeight, dur, ANALYSIS_API });
    };
    const onErr = () => { if (!loadedOkRef.current) setError("Failed to load video."); };

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
    };
  }, [videoUrl, mazeType, curVidId]);

  // stop at trim end
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onT = () => { if (isPlaying && trimEnd > 0 && v.currentTime >= trimEnd) { v.pause(); setIsPlaying(false); } };
    v.addEventListener("timeupdate", onT);
    return () => v.removeEventListener("timeupdate", onT);
  }, [isPlaying, trimEnd]);

  // reset selection when switching video/maze
  useEffect(() => {
    setSelectedRect(null);
    setActiveRegionType(null);
    setError("");
  }, [currentVideoIndex, mazeType]);

  // ── Play helpers
  const playFromRange = () => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.min(Math.max(0, trimStart), Math.max(0, duration));
    v.play().then(() => setIsPlaying(true)).catch(() => setError("Failed to play video"));
  };
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (isPlaying) { v.pause(); setIsPlaying(false); }
    else { if (v.currentTime < trimStart || v.currentTime > trimEnd) v.currentTime = trimStart; playFromRange(); }
  };

  // ── Timeline interactions
  const formatTime = (t) => {
    if (!t || isNaN(t)) return "0:00";
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const handleTimelineClick = (e) => {
    if (isTrimDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = (e.clientX - rect.left) / rect.width;
    const t = Math.max(0, Math.min(duration, p * duration));
    const v = videoRef.current; if (!v) return;
    v.currentTime = t; setCurrentTime(t);
  };
  const startTrimDrag = (e, type) => {
    e.stopPropagation();
    setIsTrimDragging(true); setTrimDragType(type);
    const container = e.currentTarget.closest(".timeline-container"); if (!container) return;
    const rect = container.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = p * duration;
    const v = videoRef.current;
    const fixedWindow = mazeType === "MorrisWaterMaze" ? 60 : 300;

    if (type === "start") {
      const tt = Math.max(0, Math.min(t, trimEnd - 0.1));
      if (v) v.currentTime = tt;
      setTrimStart(tt); setCurrentTime(tt);
      if (isPlaying && v) { v.pause(); setIsPlaying(false); }
      setTrimEnd((prevEnd) => Math.min(duration || Infinity, tt + MAX_WINDOW, Math.max(prevEnd, tt + 0.1)));
      setTrims((prev) => ({ ...prev, [curVidId]: { start: tt, end: Math.min(duration, tt + fixedWindow) } }));
    } else {
      const tt = Math.max(trimStart + 0.1, Math.min(duration, t));
      setTrimEnd(tt);
      setTrimStart((prevStart) => Math.max(0, tt - Math.min(MAX_WINDOW, tt - prevStart)));
      setTrims((prev) => ({ ...prev, [curVidId]: { start: Math.max(0, tt - fixedWindow), end: tt } }));
    }
  };

  // ── Global mouse move/up for trims + rectangles + ellipse
  useEffect(() => {
    const need = isTrimDragging || isDragging || isResizing || isRotating || isDrawing || tplDragMode !== null;
    if (!need) return;

    const mv = (e) => {
      // trims
      if (isTrimDragging && trimDragType) {
        const el = document.querySelector(".timeline-container"); if (!el) return;
        const r = el.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const t = p * duration;
        const fixedWindow = mazeType === "MorrisWaterMaze" ? 60 : 300;

        if (trimDragType === "start") {
          const tt = Math.max(0, Math.min(t, trimEnd - 0.1));
          setTrimStart(tt);
          if (videoRef.current) { videoRef.current.currentTime = tt; setCurrentTime(tt); }
          setTrimEnd((prevEnd) => Math.min(duration || Infinity, tt + MAX_WINDOW, Math.max(prevEnd, tt + 0.1)));
          setTrims((prev) => ({ ...prev, [curVidId]: { start: tt, end: Math.min(duration, tt + fixedWindow) } }));
        } else {
          const tt = Math.max(trimStart + 0.1, Math.min(duration, t));
          setTrimEnd(tt);
          setTrimStart((prevStart) => Math.max(0, tt - Math.min(MAX_WINDOW, tt - prevStart)));
          setTrims((prev) => ({ ...prev, [curVidId]: { start: Math.max(0, tt - fixedWindow), end: tt } }));
        }
        return;
      }

      // rectangles (EPM/Y)
      if (isDrawMode && (isDragging || isResizing || isRotating) && selectedRect) {
        const v = videoRef.current; if (!v) return;
        const box = getVideoContentBox(v);
        const clickVX = (e.clientX - box.left) / box.scaleX;
        const clickVY = (e.clientY - box.top) / box.scaleY;

        const list = getCurrentRectangles();
        const sel = list.find((r) => r.id === selectedRect);
        if (!sel) return;

        if (isDragging || isResizing) {
          const dx = clickVX - dragStart.x;
          const dy = clickVY - dragStart.y;

          if (isDragging) {
            const nx = Math.max(0, Math.min(v.videoWidth - sel.width, sel.x + dx));
            const ny = Math.max(0, Math.min(v.videoHeight - sel.height, sel.y + dy));
            setCurrentRectangles(list.map((r) => (r.id === sel.id ? { ...r, x: nx, y: ny } : r)));
          } else {
            let nx = sel.x, ny = sel.y, nw = sel.width, nh = sel.height;
            const minW = 20, minH = 20;
            if (resizeCorner === "se") { nw = Math.max(minW, sel.width + dx); nh = Math.max(minH, sel.height + dy); }
            else if (resizeCorner === "ne") { nw = Math.max(minW, sel.width + dx); nh = Math.max(minH, sel.height - dy); ny = sel.y + sel.height - nh; if (ny < 0) { nh += ny; ny = 0; } }
            else if (resizeCorner === "sw") { nw = Math.max(minW, sel.width - dx); nh = Math.max(minH, sel.height + dy); nx = sel.x + sel.width - nw; if (nx < 0) { nw += nx; nx = 0; } }
            else if (resizeCorner === "nw") { nw = Math.max(minW, sel.width - dx); nh = Math.max(minH, sel.height - dy); nx = sel.x + sel.width - nw; ny = sel.y + sel.height - nh; if (nx < 0) { nw += nx; nx = 0; } if (ny < 0) { nh += ny; ny = 0; } }
            if (nx + nw > v.videoWidth) nw = v.videoWidth - nx;
            if (ny + nh > v.videoHeight) nh = v.videoHeight - ny;
            setCurrentRectangles(list.map((r) => (r.id === sel.id ? { ...r, x: nx, y: ny, width: nw, height: nh } : r)));
          }
          setDragStart({ x: clickVX, y: clickVY });
          return;
        }

        if (isRotating) {
          const cx = sel.x + sel.width / 2;
          const cy = sel.y + sel.height / 2;
          let angle = Math.atan2(clickVY - cy, clickVX - cx) * (180 / Math.PI);
          if (e.shiftKey) angle = Math.round(angle / 15) * 15; // snap 15° when holding Shift
          setCurrentRectangles(list.map((r) => (r.id === sel.id ? { ...r, rotation: angle } : r)));
          return;
        }
      }

      // drawing new rect
      if (isDrawMode && isDrawing && currentDrawRect && !(mazeType === "MorrisWaterMaze" && mwmToolOn && hasTemplateNow)) {
        const v = videoRef.current; if (!v || !v.videoWidth) return;
        const box = getVideoContentBox(v);
        const vx = Math.max(0, Math.min((e.clientX - box.left) / box.scaleX, v.videoWidth));
        const vy = Math.max(0, Math.min((e.clientY - box.top) / box.scaleY, v.videoHeight));
        const s = drawStartRef.current;
        const w = Math.abs(vx - s.x), h = Math.abs(vy - s.y);
        const x = Math.min(s.x, vx), y = Math.min(s.y, vy);
        const rectNow = { x, y, width: w, height: h };
        setCurrentDrawRect(rectNow);
        drawRectRef.current = rectNow;
        return;
      }

      // ellipse template drag/resize/rotate (local-axis projection)
      if (mazeType === "MorrisWaterMaze" && mwmToolOn && tplDragMode) {
        const v = videoRef.current; if (!v) return;
        const box = getVideoContentBox(v);
        const vx = (e.clientX - box.left) / box.scaleX;
        const vy = (e.clientY - box.top) / box.scaleY;
        const tpl = getCurrentTemplate(); if (!tpl) return;

        if (tplDragMode === "move") {
          const dx = vx - tplDragStart.x, dy = vy - tplDragStart.y;
          setCurrentTemplate({
            ...tpl,
            cx: Math.max(0, Math.min(v.videoWidth, tpl.cx + dx)),
            cy: Math.max(0, Math.min(v.videoHeight, tpl.cy + dy)),
          });
          setTplDragStart({ x: vx, y: vy });
        } else if (tplDragMode === "resizeX" || tplDragMode === "resizeY") {
          const ang = (tpl.rotationDeg || 0) * Math.PI / 180;
          const dx = vx - tpl.cx;
          const dy = vy - tpl.cy;
          if (tplDragMode === "resizeX") {
            const proj = dx * Math.cos(ang) + dy * Math.sin(ang); // along local X
            setCurrentTemplate({ ...tpl, rx: Math.max(10, Math.abs(proj)) });
          } else {
            const proj = -dx * Math.sin(ang) + dy * Math.cos(ang); // along local Y
            setCurrentTemplate({ ...tpl, ry: Math.max(10, Math.abs(proj)) });
          }
        } else if (tplDragMode === "rotate") {
          const ang = Math.atan2(vy - tpl.cy, vx - tpl.cx) * (180 / Math.PI);
          setCurrentTemplate({ ...tpl, rotationDeg: ang });
        }
      }
    };

    const up = () => {
      // commit drawn rect (EPM/Y only)
      if (isDrawMode && isDrawing && drawRectRef.current && drawStartRef.current) {
        if (!(mazeType === "MorrisWaterMaze" && mwmToolOn && hasTemplateNow)) {
          const { x, y, width, height } = drawRectRef.current;
          if (width >= 5 && height >= 5) {
            const list = getCurrentRectangles();
            const used = new Set(list.map((rr) => rr.type));
            const chosenType = pendingTypeRef.current;
            const info = regionSpec.find((r) => r.type === chosenType && !used.has(r.type));
            if (info) {
              const newRect = { id: Date.now(), x, y, width, height, rotation: 0, type: info.type, color: info.color, name: info.name };
              setCurrentRectangles([...list, newRect]);
              setActiveRegionType(null);
              setSelectedRect(newRect.id);
              setError("");
            } else {
              setError("Selected region type is not available.");
            }
          } else {
            setError("Rectangle too small (min 5x5 px).");
          }
        }
      }
      pendingTypeRef.current = null;
      drawRectRef.current = null;

      setIsTrimDragging(false); setTrimDragType(null);
      setIsDrawing(false); setCurrentDrawRect(null);
      setIsDragging(false); setIsResizing(false); setResizeCorner(null);
      setIsRotating(false);
      setTplDragMode(null);
    };

    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
  }, [
    isDrawMode, isDragging, isResizing, isRotating, isDrawing,
    isTrimDragging, trimDragType,
    selectedRect, rectangles, key,
    mazeType, mwmToolOn, tplDragMode, mwmTemplates,
    duration, trimStart, trimEnd, hasTemplateNow,
  ]);

  // ── Overlay mousedown
  const onOverlayMouseDown = (e) => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;

    // MWM: create/move ellipse
    if (mazeType === "MorrisWaterMaze" && mwmToolOn) {
      const box = getVideoContentBox(v);
      const vx = Math.max(0, Math.min((e.clientX - box.left) / box.scaleX, v.videoWidth));
      const vy = Math.max(0, Math.min((e.clientY - box.top) / box.scaleY, v.videoHeight));
      const t = getCurrentTemplate();

      if (!t) {
        const r0 = Math.min(v.videoWidth, v.videoHeight) / 4;
        setCurrentTemplate({ cx: vx, cy: vy, rx: r0, ry: r0, rotationDeg: 0 });
        setError("");
        return;
      }

      // inside ellipse?
      const ang = (t.rotationDeg || 0) * Math.PI / 180;
      const dx = vx - t.cx, dy = vy - t.cy;
      const localX = Math.cos(ang) * dx + Math.sin(ang) * dy;
      const localY = -Math.sin(ang) * dx + Math.cos(ang) * dy;
      const inEllipse = (localX * localX) / (t.rx * t.rx) + (localY * localY) / (t.ry * t.ry) <= 1.0;

      if (inEllipse) {
        setTplDragMode("move");
        setTplDragStart({ x: vx, y: vy });
      }
      return;
    }

    // Rectangles (EPM/Y) start drawing
    if (e.target.getAttribute("data-el") !== "overlay") return;

    const list = getCurrentRectangles();
    const used = new Set(list.map((rr) => rr.type));
    let targetType = activeRegionType;
    if (!targetType) {
      const nextInfo = regionSpec.find((r) => !used.has(r.type));
      targetType = nextInfo?.type || null;
    }
    if (!targetType) { setError(`All ${mazeType} regions are defined`); return; }
    if (used.has(targetType)) {
      setError(`"${regionSpec.find((r) => r.type === targetType)?.name}" has been defined. Select it to edit or delete.`);
      return;
    }

    pendingTypeRef.current = targetType;

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
    if (!isDrawMode) return;
    e.stopPropagation();
    e.preventDefault();
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

  const deleteSelectedRect = () => {
    const after = getCurrentRectangles().filter((r) => r.id !== selectedRect);
    setCurrentRectangles(after);
    setSelectedRect(null);
  };


  // วาด sector ใน local space (ศูนย์กลางที่ 0,0)
  const sectorPathLocal = (rx, ry, a1Deg, a2Deg) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const x1 = rx * Math.cos(toRad(a1Deg));
    const y1 = ry * Math.sin(toRad(a1Deg));
    const x2 = rx * Math.cos(toRad(a2Deg));
    const y2 = ry * Math.sin(toRad(a2Deg));
    const largeArc = (Math.abs((a2Deg - a1Deg + 360) % 360) > 180) ? 1 : 0;
    return `M 0 0 L ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  // mapping ของควอดแรนต์แบบเดียวกับเวอร์ชันที่ทำงานถูก (Q1 ด้านขวาบน)
  const Q_ANGLES = { Q1: [270, 360], Q2: [180, 270], Q3: [90, 180], Q4: [0, 90] };
  const getAngles = (q) => Q_ANGLES[String(q).toUpperCase()] || Q_ANGLES.Q1;
  const midAngleDeg = ([a1, a2]) => {
    let s = a1, e = a2;
    if (e <= s) e += 360;           // unwrap ให้ e > s เสมอ
    return (s + e) / 2;             // มุมกึ่งกลางไว้สำหรับวาง label
  };

  const sectorAnglesCW = (q) => {
    const order = ["Q1", "Q2", "Q3", "Q4"];           // clockwise
    const i = order.indexOf(String(q).toUpperCase());
    if (i < 0) return [315, 405];                  // fallback: Q1
    const start = (315 + i * 90) % 360;            // Q1:315, Q2:45, Q3:135, Q4:225
    let end = (start + 90) % 360;                  // +90°
    if (end <= start) end += 360;                  // unwrap so end > start
    return [start, end];
  };

  // ── Process
  const processAllVideos = async () => {
    if (!allConfigured) { setError("Please define regions (or MWM template) for all videos first."); return; }
    // กันลืม mouseCode
    const noMouseCode = (videoPairs || []).filter(v => !v.mouseCode);
    if (noMouseCode.length) {
      setError("Some videos have no mouse code. Please assign mouse code for every video.");
      return;
    }
    if (!testId) { setError("Missing testId. Please go back to Create Test and try again."); return; }

    // สำหรับ EPM/Y: ส่ง rectangles ตามเดิม
    // สำหรับ MWM: ไม่ส่ง rectangles แล้ว (ปล่อยเป็น {}), ส่งแต่ template + targetQuadrant
    const rectanglesByMouse = {};
    if (mazeType !== "MorrisWaterMaze") {
      (videoPairs || []).forEach((vp, idx) => {
        const k = keyForIndex(idx);
        const list = (rectangles[k] || []).map((r) => ({
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          rotation: Math.round(r.rotation || 0),
          type: r.type,
        }));
        if (vp.mouseCode) rectanglesByMouse[vp.mouseCode] = list;
      });
    }

    // MWM template per mouse
    const mwmTemplateByMouse = {};
    if (mazeType === "MorrisWaterMaze") {
      (videoPairs || []).forEach((vp, idx) => {
        const k = keyForIndex(idx);
        const t = mwmTemplates[k];
        if (t && vp.mouseCode) {
          mwmTemplateByMouse[vp.mouseCode] = {
            cx: Math.round(t.cx), cy: Math.round(t.cy),
            rx: Math.round(t.rx), ry: Math.round(t.ry),
            rotationDeg: Math.round(t.rotationDeg || 0),
          };
        }
      });
    }

    const serviceMaze = MAZE_TO_SERVICE[mazeType] || mazeType;
    setIsProcessing(true); setError("");

    const perVideoTimesById = {};
    const windowLimit = mazeType === "MorrisWaterMaze" ? 60 : 300;
    (videoPairs || []).forEach((vp) => {
      const vid = vp.videoId || vp._id; if (!vid) return;
      const saved = trimsRef.current[vid];
      const dur = durations[vid];
      const start = Number(saved?.start ?? 0);
      const endCap = Number.isFinite(dur) && dur > 0 ? Math.min(windowLimit, dur) : windowLimit;
      const end = Number(saved?.end ?? endCap);
      perVideoTimesById[vid] = { startSec: start, endSec: end };
    });

    try {
      const u = auth.currentUser; if (!u) throw new Error("Please login again");
      const idToken = await u.getIdToken(true);
      const testTargetQuadrant = mazeType === "MorrisWaterMaze" ? (targetQuadrant || "Q1").toUpperCase() : undefined;

      void fetch(`${BACKEND_URL}/api/tests/${testId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          mazeType: serviceMaze,
          rectanglesByMouse,           // {} เมื่อเป็น MWM
          perVideoTimesById,
          targetQuadrant: testTargetQuadrant,
          ...(mazeType === "MorrisWaterMaze" ? { mwmTemplateByMouse } : {}),
        }),
        keepalive: true,
      }).catch((err) => console.error("analyze fire-and-forget error:", err));

      const ids = (videoPairs || [])
        .map((v) => {
          const id = v.videoId || v._id;
          if (!id) return null;
          const label = `${testName || "Test"}_${v.mouseCode || id}`;
          return { id, label, testId, mouseCode: v.mouseCode || "", testName };
        })
        .filter(Boolean);
      addJobs(ids);

      navigate("/manage-test", { replace: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      setError(e?.message || "Failed to process. Make sure backend is running.");
    } finally {
      setIsProcessing(false);
    }
  };

  const displayName =
    currentVideo?.video?.name ||
    currentVideo?.originalName ||
    (currentVideo?.serverUrl ? decodeURIComponent(currentVideo.serverUrl.split("/").pop() || "") : "") ||
    "—";

  // ── Render
  return (
    <div className="app-main">
      <div className="main-wrap">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Trim & Regions</h3>

          {currentVideo && (
            <div className="info-bar">
              <div>
                <div className="muted">File</div>
                <strong>{displayName}</strong>
                <div className="muted">Mouse Code: {currentVideo.mouseCode || "—"}</div>
                {mazeType === "MorrisWaterMaze" && (
                  <div className="muted">
                    Target Quadrant: <strong>{String(targetQuadrant).toUpperCase()}</strong>
                  </div>
                )}
              </div>

              {videoPairs?.length > 1 && (
                <div className="btn-group">
                  <button className="btn" disabled={currentVideoIndex === 0} onClick={() => setCurrentVideoIndex((i) => Math.max(0, i - 1))}>Prev</button>
                  <button className="btn" disabled={currentVideoIndex === videoPairs.length - 1} onClick={() => setCurrentVideoIndex((i) => Math.min(videoPairs.length - 1, i + 1))}>Next</button>
                </div>
              )}
            </div>
          )}

          {error && <div className="alert danger">{error}</div>}

          {/* Toolbar */}
          <div className="toolbar" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            {/* EPM/Y: Define Regions */}
            {mazeType !== "MorrisWaterMaze" && (
              <button
                className={`seg-btn ${isDrawMode ? "active" : ""}`}
                onClick={() => setIsDrawMode((v) => !v)}
                style={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: isDrawMode ? "var(--brand)" : "#fff",
                  color: isDrawMode ? "#fff" : "#334155",
                }}
                title="Toggle Define Regions"
              >
                <Square size={16} />
                <span style={{ marginLeft: 8 }}>
                  Define Regions ({getCurrentRectangles().length}/{(regionSpec || []).length})
                </span>
              </button>
            )}

            {/* MWM ellipse template */}
            {mazeType === "MorrisWaterMaze" && (
              <div className="btn-group" style={{ gap: 8 }}>
                <button className={`btn ${mwmToolOn ? "primary" : ""}`} onClick={() => setMwmToolOn((v) => !v)} title="Toggle MWM ellipse tool">
                  <CircleIcon size={16} /> <span style={{ marginLeft: 6 }}>MWM Ellipse Template</span> {mwmToolOn ? "ON" : "OFF"}
                </button>
                <button className="btn" onClick={() => setCurrentTemplate(null)} title="Remove template">
                  <Trash2 size={16} /> <span style={{ marginLeft: 6 }}>Remove</span>
                </button>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {allConfigured && (
              <button className="btn primary" disabled={isProcessing} onClick={processAllVideos}>
                <Send size={16} /> {isProcessing ? " Processing..." : " Process All Videos"}
              </button>
            )}
          </div>

          {/* Video + overlay */}
          <div style={{ position: "relative" }}>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full"
              style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--border)", background: "#000", maxHeight: 420, objectFit: "contain" }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            <div
              ref={overlayRef}
              data-el="overlay"
              onMouseDown={onOverlayMouseDown}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                cursor:
                  mazeType === "MorrisWaterMaze" && mwmToolOn
                    ? "default"
                    : isDrawMode
                      ? activeRegionType
                        ? "crosshair"
                        : "default"
                      : "default",
              }}
            >
              {(() => {
                const v = videoRef.current; if (!v || !v.videoWidth) return null;
                const container = overlayRef.current?.getBoundingClientRect(); if (!container) return null;
                const box = getVideoContentBox(v);
                const left = box.left - container.left, top = box.top - container.top;
                const sx = box.scaleX, sy = box.scaleY;

                const tpl = getCurrentTemplate();

                return (
                  <>
                    {/* MWM ellipse template + highlight target sector */}
                    {mazeType === "MorrisWaterMaze" && tpl && (
                      <div style={{ position: "absolute", left: 0, top: 0 }}>
                        {(() => {
                          const scx = left + tpl.cx * sx;
                          const scy = top + tpl.cy * sy;
                          const rxS = tpl.rx * sx;
                          const ryS = tpl.ry * sy;
                          const deg = tpl.rotationDeg || 0;

                          const tq = String(targetQuadrant || "Q1").toUpperCase();
                          const [a1, a2] = getAngles(tq);

                          return (
                            <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
                              onMouseDown={(e) => e.stopPropagation()}>
                              {/* วาดทุกอย่างใน local space แล้ว translate+rotate กลุ่มทีเดียว */}
                              <g transform={`translate(${scx} ${scy}) rotate(${deg})`}>
                                {/* --- HIGHLIGHT --- */}
                                <path d={sectorPathLocal(rxS, ryS, a1, a2)}
                                  fill="#0ea5e9" fillOpacity="0.40" stroke="none" pointerEvents="none" />

                                {/* วงรี + crosshairs + handles (เหมือนเดิม) */}
                                <ellipse cx={0} cy={0} rx={rxS} ry={ryS}
                                  fill="none" stroke="#0ea5e9" strokeWidth="2"
                                  style={{ cursor: "move", pointerEvents: "all" }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    const b = getVideoContentBox(videoRef.current);
                                    const vx = (e.clientX - b.left) / b.scaleX;
                                    const vy = (e.clientY - b.top) / b.scaleY;
                                    setTplDragMode("move"); setTplDragStart({ x: vx, y: vy });
                                  }} />
                                <line x1={-rxS} y1={0} x2={rxS} y2={0} stroke="#0ea5e9" strokeWidth="1.5" />
                                <line x1={0} y1={-ryS} x2={0} y2={ryS} stroke="#0ea5e9" strokeWidth="1.5" />
                                <circle cx={rxS} cy={0} r="6" fill="#0ea5e9"
                                  style={{ cursor: "ew-resize", pointerEvents: "all" }}
                                  onMouseDown={(e) => { e.stopPropagation(); setTplDragMode("resizeX"); }} />
                                <circle cx={0} cy={-ryS} r="6" fill="#0ea5e9"
                                  style={{ cursor: "ns-resize", pointerEvents: "all" }}
                                  onMouseDown={(e) => { e.stopPropagation(); setTplDragMode("resizeY"); }} />
                                <line x1={0} y1={-ryS} x2={0} y2={-ryS - 24} stroke="#0ea5e9" strokeDasharray="4,4" strokeWidth="1" />
                                <circle cx={0} cy={-ryS - 24} r="6" fill="#0ea5e9"
                                  style={{ cursor: "crosshair", pointerEvents: "all" }}
                                  onMouseDown={(e) => { e.stopPropagation(); setTplDragMode("rotate"); }} />

                                {/* --- LABELS (ผูกกับควอดแรนต์เดียวกัน) --- */}
                                {["Q1", "Q2", "Q3", "Q4"].map(q => {
                                  const m = (midAngleDeg(getAngles(q)) * Math.PI) / 180;
                                  const lx = 0.55 * rxS * Math.cos(m);
                                  const ly = 0.55 * ryS * Math.sin(m);
                                  const isT = q === tq;
                                  const common = {
                                    textAnchor: "middle",
                                    fontSize: 12,
                                    fill: "#fff",
                                    stroke: "#0f172a",
                                    strokeWidth: 1,
                                    paintOrder: "stroke",
                                    pointerEvents: "none",
                                  };
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
                        })()}
                      </div>
                    )}

                    {/* EPM / Y: render existing rectangles with handles */}
                    {mazeType !== "MorrisWaterMaze" && (() => {
                      const rects = getCurrentRectangles();
                      if (!rects.length) return null;

                      const toScreen = (vx, vy) => ({ x: left + vx * sx, y: top + vy * sy });
                      const cursorForCorner = (name) => {
                        switch (name) {
                          case "nw": return "nwse-resize";
                          case "se": return "nwse-resize";
                          case "ne": return "nesw-resize";
                          case "sw": return "nesw-resize";
                          default: return "nwse-resize";
                        }
                      };

                      // ทำให้ SVG โปร่งต่อการคลิกในพื้นที่ว่าง แต่ชิ้นส่วนภายในตั้ง pointerEvents: "all"
                      return (
                        <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
                          {rects.map((r) => {
                            // screen coords
                            const p = toScreen(r.x, r.y);
                            const w = r.width * sx;
                            const h = r.height * sy;
                            const cx = p.x + w / 2;
                            const cy = p.y + h / 2;
                            const rot = r.rotation || 0;

                            const sel = selectedRect === r.id;
                            const stroke = r.color || "#0ea5e9";
                            const fillOpacity = sel ? 0.12 : 0;              // ไฮไลท์ภายในเมื่อถูกเลือก

                            const hs = 6; // handle size

                            const corners = [
                              { name: "nw", x: p.x, y: p.y },
                              { name: "ne", x: p.x + w, y: p.y },
                              { name: "se", x: p.x + w, y: p.y + h },
                              { name: "sw", x: p.x, y: p.y + h },
                            ];

                            const rotRad = (rot * Math.PI) / 180;
                            const rotPt = (x, y) => {
                              const dx = x - cx, dy = y - cy;
                              return {
                                x: cx + dx * Math.cos(rotRad) - dy * Math.sin(rotRad),
                                y: cy + dx * Math.sin(rotRad) + dy * Math.cos(rotRad),
                              };
                            };

                            const rp = corners.map(c => rotPt(c.x, c.y));
                            const d = `M ${rp[0].x} ${rp[0].y} L ${rp[1].x} ${rp[1].y} L ${rp[2].x} ${rp[2].y} L ${rp[3].x} ${rp[3].y} Z`;

                            const topMid = rotPt((p.x + p.x + w) / 2, p.y);
                            const rotHandle = { x: topMid.x, y: topMid.y - 24 };

                            return (
                              <g key={r.id} style={{ pointerEvents: "all" }}>
                                {/* label */}
                                <text
                                  x={cx} y={cy - 10}
                                  textAnchor="middle"
                                  fontSize="12"
                                  fill="#fff"
                                  stroke="#0f172a"
                                  strokeWidth="1"
                                  paintOrder="stroke"
                                  style={{ pointerEvents: "none" }}
                                >
                                  {r.name || r.type}
                                </text>

                                {/* body: ใช้สี region และไฮไลท์เมื่อเลือก */}
                                <path
                                  d={d}
                                  fill={stroke}
                                  fillOpacity={fillOpacity}
                                  stroke={stroke}
                                  strokeWidth={sel ? 2.5 : 1.8}
                                  onMouseDown={(e) => onRectMouseDown(e, r.id, "move")}
                                  style={{ cursor: "move", pointerEvents: "all" }}
                                />
                                {/* เส้นประสีขาวบาง ๆ ทับ เมื่อถูกเลือก */}
                                {sel && (
                                  <path
                                    d={d}
                                    fill="none"
                                    stroke="#ffffffcc"
                                    strokeWidth="1"
                                    strokeDasharray="5,4"
                                    pointerEvents="none"
                                  />
                                )}

                                {/* resize handles (ใช้สีเดียวกับ region ไม่ใช้สีดำ) */}
                                {corners.map((c) => {
                                  const rr = rotPt(c.x, c.y);
                                  return (
                                    <rect
                                      key={c.name}
                                      x={rr.x - hs} y={rr.y - hs}
                                      width={hs * 2} height={hs * 2}
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
                                  stroke={stroke}
                                  strokeDasharray="4,4"
                                  strokeWidth="1"
                                />
                                <circle
                                  cx={rotHandle.x} cy={rotHandle.y} r="7"
                                  fill={stroke}
                                  stroke="#fff"
                                  strokeWidth="1"
                                  onMouseDown={(e) => onRectMouseDown(e, r.id, "rotate")}
                                  style={{ cursor: "crosshair", pointerEvents: "all" }}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}

                    {/* drawing rectangle preview */}
                    {isDrawMode && isDrawing && currentDrawRect && !(mazeType === "MorrisWaterMaze" && mwmToolOn && hasTemplateNow) && (
                      <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
                        <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                          <rect
                            x={left + currentDrawRect.x * sx}
                            y={top + currentDrawRect.y * sy}
                            width={currentDrawRect.width * sx}
                            height={currentDrawRect.height * sy}
                            fill="none"
                            stroke={regionSpec.find(r => r.type === (activeRegionType || pendingTypeRef.current))?.color || "#0ea5e9"}
                            strokeDasharray="5,5"
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Controller: Play + Timeline */}
          <div className="clip-edges" style={{ marginTop: 14 }}>
            <div className="btn-group" style={{ marginBottom: 10 }}>
              <button className="icon-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <span className="muted">{formatTime(trimStart)}–{formatTime(trimEnd || duration)}</span>
              <div className="flex-1" style={{ minWidth: 280 }}>
                <div className="timeline-container" onClick={handleTimelineClick}>
                  <div className="trim-section" style={{ left: `${duration ? (trimStart / duration) * 100 : 0}%`, width: `${duration ? ((trimEnd - trimStart) / duration) * 100 : 0}%` }} />
                  <div
                    className="timeline-progress"
                    style={{
                      left: `${duration ? (trimStart / duration) * 100 : 0}%`,
                      width: `${duration && currentTime >= trimStart && currentTime <= trimEnd ? ((Math.min(currentTime, trimEnd) - trimStart) / duration) * 100 : 0}%`,
                    }}
                  />
                  <div className="timeline-handle" style={{ left: `${duration ? (trimStart / duration) * 100 : 0}%` }} onMouseDown={(e) => startTrimDrag(e, "start")} />
                  <div className="timeline-handle" style={{ left: `${duration ? (trimEnd / duration) * 100 : 0}%` }} onMouseDown={(e) => startTrimDrag(e, "end")} />
                </div>
              </div>
              <span className="muted">{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>

            {/* Helpers / delete for rectangles only */}
            {isDrawMode && mazeType !== "MorrisWaterMaze" && (
              <div style={{ marginTop: 6 }}>
                <div className="grid-helpers">
                  {regionSpec.map((r, i) => {
                    const list = getCurrentRectangles();
                    const rect = list.find((rr) => rr.type === r.type);
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
                        title={isDefined ? "Click to select this region" : "Click, then draw on the video"}
                      >
                        <span className="chip-dot" style={{ borderColor: r.color }} />
                        {i + 1}. {r.name} {isDefined ? "✓" : isActiveToDraw ? "(selected to draw)" : ""}
                      </button>
                    );
                  })}
                </div>

                <div className="toolbar" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn" onClick={() => setSelectedRect(null)} title="Deselect all">
                    Deselect All
                  </button>
                  <button className="btn danger" onClick={() => selectedRect && deleteSelectedRect()} disabled={!selectedRect} title="Delete selected region">
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            )}

            {/* Tip for MWM */}
            {mazeType === "MorrisWaterMaze" && (
              <div className="muted" style={{ marginTop: 8 }}>
                Tip: Drag <strong>inside the ellipse</strong> to move. Drag the side/top small handle to resize X/Y. Drag the outer handle to rotate.
              </div>
            )}
          </div>

          {videoPairs?.length > 1 && (
            <div className="muted" style={{ marginTop: 8 }}>
              Configured:{" "}
              {
                videoPairs.filter((_, idx) => {
                  const k = keyForIndex(idx);
                  const tpl = mwmTemplates[k];
                  const r = rectangles[k] || [];
                  return mazeType === "MorrisWaterMaze" ? !!tpl : r.length === regionSpec.length;
                }).length
              } / {videoPairs.length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
