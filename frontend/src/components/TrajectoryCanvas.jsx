// src/components/TrajectoryCanvas.jsx

import React, { useEffect, useRef, useState } from 'react';

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

// ========== Helper Functions ==========
function drawArenaOutline(ctx, videoW, videoH, scale, offsetX, offsetY, mazeType) {
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  
  const w = videoW * scale;
  const h = videoH * scale;
  
  // Draw outer rectangle
  ctx.strokeRect(offsetX, offsetY, w, h);
  
  // For MWM, draw circle and quadrant lines
  if (mazeType?.toLowerCase().includes('morris') || mazeType?.toLowerCase().includes('mwm')) {
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

function drawTrajectoryPath(ctx, trajectory, scale, offsetX, offsetY) {
  if (!trajectory || trajectory.length < 2) return;
  
  // Draw path with gradient color from blue (start) to red (end)
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (let i = 0; i < trajectory.length - 1; i++) {
    const p1 = trajectory[i];
    const p2 = trajectory[i + 1];
    
    // Color gradient: blue → red
    const progress = i / (trajectory.length - 1);
    const r = Math.floor(59 + progress * (239 - 59));   // 59 → 239
    const g = Math.floor(130 - progress * 130);           // 130 → 0
    const b = Math.floor(246 - progress * (246 - 68));   // 246 → 68
    
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(offsetX + p1.x * scale, offsetY + p1.y * scale);
    ctx.lineTo(offsetX + p2.x * scale, offsetY + p2.y * scale);
    ctx.stroke();
  }
  
  // Start point (green circle)
  const start = trajectory[0];
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(
    offsetX + start.x * scale,
    offsetY + start.y * scale,
    6, 0, Math.PI * 2
  );
  ctx.fill();
  
  // End point (red circle)
  const end = trajectory[trajectory.length - 1];
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(
    offsetX + end.x * scale,
    offsetY + end.y * scale,
    6, 0, Math.PI * 2
  );
  ctx.fill();
  
  // Add labels
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
  
  // Count visits per cell
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

export default function TrajectoryCanvas({ videoId, token, mazeType }) {
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
          { headers: { Authorization: `Bearer ${token}` }}
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
    const { trajectory, videoDimensions } = data;
    
    if (!trajectory || !trajectory.length) return;
    
    // Calculate scaling
    const videoW = videoDimensions?.width || 1920;
    const videoH = videoDimensions?.height || 1080;
    const scaleX = (canvas.width * 0.9) / videoW;
    const scaleY = (canvas.height * 0.9) / videoH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (canvas.width - videoW * scale) / 2;
    const offsetY = (canvas.height - videoH * scale) / 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background arena outline
    drawArenaOutline(ctx, videoW, videoH, scale, offsetX, offsetY, mazeType);
    
    // Draw heatmap (optional)
    if (showHeatmap) {
      drawHeatmap(ctx, trajectory, videoW, videoH, scale, offsetX, offsetY);
    }
    
    // Draw trajectory path
    drawTrajectoryPath(ctx, trajectory, scale, offsetX, offsetY);
    
  }, [data, showHeatmap, mazeType]);
  
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

      {/* <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
          Show Heatmap
        </label>
      </div> */}
      
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