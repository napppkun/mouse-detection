// src/components/TrajectoryCanvas.jsx

import React, { useEffect, useRef, useState } from 'react';

const BACKEND_URL =
  window._env_?.BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "http://localhost:5000";

// ========== Helper Functions ==========
function drawArenaOutline(ctx, videoW, videoH, scale, offsetX, offsetY, mazeType, hasCustomEllipse = false) {
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;

  const w = videoW * scale;
  const h = videoH * scale;

  // Draw outer rectangle
  ctx.strokeRect(offsetX, offsetY, w, h);

  const isMWM = mazeType?.toLowerCase().includes('morris') || mazeType?.toLowerCase().includes('mwm');

  // No ellipse template then draw default circle 
  if (isMWM && !hasCustomEllipse) {
    const cx = offsetX + w / 2;
    const cy = offsetY + h / 2;
    const r = Math.min(w, h) / 2 * 0.8;

    ctx.strokeStyle = '#666';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Quadrant lines
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Q1', cx + r * 0.5, cy - r * 0.5);
    ctx.fillText('Q2', cx - r * 0.5, cy - r * 0.5);
    ctx.fillText('Q3', cx - r * 0.5, cy + r * 0.5);
    ctx.fillText('Q4', cx + r * 0.5, cy + r * 0.5);
  }
}

function drawEllipseRegion(ctx, ellipse, scale, offsetX, offsetY) {
  if (!ellipse) return;
  const { cx, cy, rx, ry, rotationDeg = 0 } = ellipse;

  const scaledCx = offsetX + cx * scale;
  const scaledCy = offsetY + cy * scale;
  const scaledRx = rx * scale;
  const scaledRy = ry * scale;
  const rad = (rotationDeg * Math.PI) / 180;

  ctx.save();
  ctx.translate(scaledCx, scaledCy);
  if (rotationDeg) ctx.rotate(rad);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, scaledRx, scaledRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawMWMQuadrantLabels(ctx, ellipse, scale, offsetX, offsetY) {
  if (!ellipse) return;
  const { cx, cy, rx, ry, rotationDeg = 0 } = ellipse;

  const baseCx = offsetX + cx * scale;
  const baseCy = offsetY + cy * scale;
  const baseRx = rx * scale;
  const baseRy = ry * scale;
  const rad = (rotationDeg * Math.PI) / 180;

  const quads = [
    { label: "Q1", dx: baseRx * 0.6, dy: -baseRy * 0.6 },
    { label: "Q2", dx: -baseRx * 0.6, dy: -baseRy * 0.6 },
    { label: "Q3", dx: -baseRx * 0.6, dy: baseRy * 0.6 },
    { label: "Q4", dx: baseRx * 0.6, dy: baseRy * 0.6 },
  ];

  ctx.save();
  ctx.fillStyle = "#888";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  quads.forEach(({ label, dx, dy }) => {
    const rxp = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ryp = dx * Math.sin(rad) + dy * Math.cos(rad);
    ctx.fillText(label, baseCx + rxp, baseCy + ryp);
  });

  ctx.restore();
}

function drawMWMQuadrantLines(ctx, ellipse, scale, offsetX, offsetY) {
  if (!ellipse) return;
  const { cx, cy, rx, ry, rotationDeg = 0 } = ellipse;

  const baseCx = offsetX + cx * scale;
  const baseCy = offsetY + cy * scale;
  const baseRx = rx * scale;
  const baseRy = ry * scale;
  const rad = (rotationDeg * Math.PI) / 180;

  const h1 = { x: -baseRx, y: 0 };
  const h2 = { x: baseRx, y: 0 };

  const v1 = { x: 0, y: -baseRy };
  const v2 = { x: 0, y: baseRy };

  const rotate = (p) => ({
    x: p.x * Math.cos(rad) - p.y * Math.sin(rad),
    y: p.x * Math.sin(rad) + p.y * Math.cos(rad),
  });

  const rh1 = rotate(h1);
  const rh2 = rotate(h2);
  const rv1 = rotate(v1);
  const rv2 = rotate(v2);

  ctx.save();
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(baseCx + rh1.x, baseCy + rh1.y);
  ctx.lineTo(baseCx + rh2.x, baseCy + rh2.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(baseCx + rv1.x, baseCy + rv1.y);
  ctx.lineTo(baseCx + rv2.x, baseCy + rv2.y);
  ctx.stroke();

  ctx.restore();
}

// ================= Trajectory helpers =================

// แบ่ง trajectory ออกเป็นหลายเส้นย่อย ถ้า gap ด้านเวลาเยอะเกิน หรือความเร็วสูงผิดปกติ
function splitTrajectoryIntoSegments(trajectory, sampleInterval) {
  const segments = [];
  if (!trajectory || trajectory.length < 2) return segments;

  const dtBase = (typeof sampleInterval === 'number' && sampleInterval > 0)
    ? sampleInterval
    : 1.0;
  const DT_THRESHOLD = dtBase * 1.7;         // ถ้าเว้นเกิน ~1.7 เท่าของช่วง sample → ตัดเส้น
  const MAX_SPEED = 800;                     // px/sec คร่าว ๆ ป้องกัน jump แรง ๆ

  let current = [];

  for (let i = 0; i < trajectory.length; i++) {
    const p = trajectory[i];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }

    if (current.length === 0) {
      current.push(p);
      continue;
    }

    const prev = current[current.length - 1];
    const dt = (p.t ?? i) - (prev.t ?? (i - 1));
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const dist = Math.hypot(dx, dy);
    const speed = dt > 0 ? dist / dt : 0;

    const gapByTime = dt > DT_THRESHOLD;
    const gapBySpeed = speed > MAX_SPEED;

    if (gapByTime || gapBySpeed) {
      if (current.length > 1) segments.push(current);
      current = [p];
    } else {
      current.push(p);
    }
  }

  if (current.length > 1) segments.push(current);
  return segments;
}

function drawTrajectoryPath(ctx, trajectory, scale, offsetX, offsetY, sampleInterval) {
  if (!trajectory || trajectory.length < 2) return;

  const segments = splitTrajectoryIntoSegments(trajectory, sampleInterval);
  if (!segments.length) return;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  segments.forEach((seg) => {
    if (seg.length < 2) return;

    for (let i = 0; i < seg.length - 1; i++) {
      const p1 = seg[i];
      const p2 = seg[i + 1];

      ctx.strokeStyle = '#2563eb';
      ctx.beginPath();
      ctx.moveTo(offsetX + p1.x * scale, offsetY + p1.y * scale);
      ctx.lineTo(offsetX + p2.x * scale, offsetY + p2.y * scale);
      ctx.stroke();
    }
  });

  // Start point (green circle)
  const start = trajectory[0];
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(
    offsetX + start.x * scale,
    offsetY + start.y * scale,
    10, 0, Math.PI * 2
  );
  ctx.fill();

  // End point (red circle)
  const end = trajectory[trajectory.length - 1];
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(
    offsetX + end.x * scale,
    offsetY + end.y * scale,
    10, 0, Math.PI * 2
  );
  ctx.fill();

  // Labels
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', offsetX + start.x * scale, offsetY + start.y * scale);
  ctx.fillText('E', offsetX + end.x * scale, offsetY + end.y * scale);
}

function drawHeatmap(ctx, trajectory, videoW, videoH, scale, offsetX, offsetY) {
  if (!trajectory || !trajectory.length) return;

  const GRID_SIZE = 40;
  const grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));

  for (const p of trajectory) {
    const gx = Math.floor((p.x / videoW) * GRID_SIZE);
    const gy = Math.floor((p.y / videoH) * GRID_SIZE);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      grid[gy][gx]++;
    }
  }

  const maxCount = Math.max(...grid.flat(), 1);
  const cellW = (videoW * scale) / GRID_SIZE;
  const cellH = (videoH * scale) / GRID_SIZE;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const count = grid[y][x];
      if (count > 0) {
        const intensity = count / maxCount;
        ctx.fillStyle = `rgba(239, 68, 68, ${intensity * 0.5})`;
        ctx.fillRect(
          offsetX + x * cellW,
          offsetY + y * cellH,
          cellW,
          cellH
        );
      }
    }
  }
}

function prettyRegionLabel(type) {
  if (!type) return '';
  const map = {
    open_arm_1: 'Open arm 1',
    open_arm_2: 'Open arm 2',
    closed_arm_1: 'Closed arm 1',
    closed_arm_2: 'Closed arm 2',
  };
  if (map[type]) return map[type];
  return type;
}

function drawUserRegions(ctx, regions, scale, offsetX, offsetY) {
  if (!regions || !regions.length) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';

  regions.forEach((region) => {
    const { x, y, width, height, rotation = 0, type } = region;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number'
    ) {
      return;
    }

    const scaledX = offsetX + x * scale;
    const scaledY = offsetY + y * scale;
    const scaledW = width * scale;
    const scaledH = height * scale;

    const cx = scaledX + scaledW / 2;
    const cy = scaledY + scaledH / 2;
    const rad = (rotation * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rad);
    ctx.strokeRect(-scaledW / 2, -scaledH / 2, scaledW, scaledH);
    ctx.restore();

    const label = prettyRegionLabel(type);
    if (label) {
      ctx.fillText(label, cx, cy - scaledH / 2 - 6);
    }
  });

  ctx.restore();
}

export default function TrajectoryCanvas({ videoId, token, mazeType, regions = [], ellipse = null }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(false);

  useEffect(() => {
    async function fetchTrajectory() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(
          `${BACKEND_URL}/api/videos/${videoId}/trajectory`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.message || "Failed to load trajectory");
        }
      } catch (e) {
        console.error(e);
        setError(e.message || "Failed to load trajectory");
      } finally {
        setLoading(false);
      }
    }
    if (videoId && token) {
      fetchTrajectory();
    }
  }, [videoId, token]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { trajectory, videoDimensions, metadata } = data;

    if (!trajectory || !trajectory.length) return;

    const videoW = videoDimensions?.width || 1920;
    const videoH = videoDimensions?.height || 1080;
    const scaleX = (canvas.width * 0.9) / videoW;
    const scaleY = (canvas.height * 0.9) / videoH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (canvas.width - videoW * scale) / 2;
    const offsetY = (canvas.height - videoH * scale) / 2;

    const hasEllipse =
      !!ellipse &&
      typeof ellipse.cx === "number" &&
      typeof ellipse.cy === "number";

    const sampleInterval = metadata?.sampleInterval ?? metadata?.sample_interval ?? 0;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawArenaOutline(ctx, videoW, videoH, scale, offsetX, offsetY, mazeType, hasEllipse);

    if (
      (mazeType?.toLowerCase().includes("morris") ||
        mazeType?.toLowerCase().includes("mwm")) &&
      ellipse
    ) {
      drawEllipseRegion(ctx, ellipse, scale, offsetX, offsetY);
      drawMWMQuadrantLines(ctx, ellipse, scale, offsetX, offsetY);
      drawMWMQuadrantLabels(ctx, ellipse, scale, offsetX, offsetY);
    }

    if (showHeatmap) {
      drawHeatmap(ctx, trajectory, videoW, videoH, scale, offsetX, offsetY);
    }

    drawUserRegions(ctx, regions, scale, offsetX, offsetY);

    drawTrajectoryPath(ctx, trajectory, scale, offsetX, offsetY, sampleInterval);

  }, [data, showHeatmap, mazeType, regions, ellipse]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div className="spinner" />
        <div className="muted" style={{ marginTop: 8 }}>Loading trajectory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)' }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="muted" style={{ padding: 24 }}>No trajectory data available</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{
          border: '1px solid var(--border)',
          backgroundColor: '#fafafa',
          borderRadius: 4,
          width: '100%',
          height: 'auto'
        }}
      />
    </div>
  );
}
