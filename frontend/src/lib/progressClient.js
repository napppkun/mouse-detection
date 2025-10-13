// src/lib/progressClient.js
const ANALYSIS_BASE = process.env.RUNPOD_ENDPOINT_URL || window._env_?.ANALYSIS_API || "http://127.0.0.1:8000";

export async function fetchProgress(ids = []) {
  if (!ids.length) return {};
  const q = encodeURIComponent(ids.join(","));
  const res = await fetch(`${ANALYSIS_BASE}/progress?ids=${q}`);
  if (!res.ok) throw new Error("progress fetch failed");
  return await res.json();
}
