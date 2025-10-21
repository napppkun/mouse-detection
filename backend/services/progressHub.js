// backend/services/progressHub.js
const clientsById = new Map(); // id -> Set({ res, timer })
const lastStateById = new Map(); // id -> { runId, status, progress, stage }
const mutedUntilRunId = new Map(); // id -> runId (mute จนกว่าจะมี runId > นี้)

export function stream(req, res) {
  const ids = String(req.query.ids || "").split(",").filter(Boolean);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",   // กัน Nginx buffer
    "Keep-Alive": "timeout=120", // hint
  });

  // ส่ง “hello” ทันที ลดโอกาสโดนตัดก่อนมี data
  res.write(`event: open\ndata: ok\n\n`);

  // heartbeat comment ทุก 15s ป้องกัน idle timeout ตาม proxy
  const timer = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  ids.forEach(id => {
    if (!clientsById.has(id)) clientsById.set(id, new Set());
    clientsById.get(id).add({ res, timer });

    // ส่ง snapshot ล่าสุดให้ client ทันที (ถ้ามีและไม่ถูก mute)
    const last = lastStateById.get(id);
    const mutedUntil = mutedUntilRunId.get(id) ?? -Infinity;
    if (last && !(Number(last.runId || 0) <= mutedUntil)) {
      try { res.write(`data: ${JSON.stringify({ id, ...last })}\n\n`); } catch (_) { }
    }
  });

  const cleanup = () => {
    ids.forEach(id => {
      const set = clientsById.get(id);
      if (!set) return;
      for (const entry of set) {
        if (entry.res === res) {
          clearInterval(entry.timer);
          set.delete(entry);
        }
      }
      if (set.size === 0) clientsById.delete(id);
    });
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}

export function publish(msg) {
  const { id } = msg || {};
  if (!id) return;

  // guard ด้วย runId
  const incomingRun = Number(msg.runId || 0);
  const prev = lastStateById.get(id) || {};
  const prevRun = Number(prev.runId || 0);

  // เพิกเฉย event ที่ runId เก่ากว่า
  if (incomingRun && prevRun && incomingRun < prevRun) return;

  // ไม่ยอม downgrade จาก processed -> failed ใน run เดียวกัน/เก่ากว่า
  const incomingStatus = String(msg.status || "").toLowerCase();
  const prevStatus = String(prev.status || "").toLowerCase();
  if (prevStatus === "processed" && incomingStatus === "failed") {
    // ถ้าเป็น run ใหม่กว่า อนุโลมเฉพาะกรณีคุณอยากให้ล้มจริง ๆ ก็เปลี่ยนเงื่อนไข; ดีฟอลต์คือ block
    if (!incomingRun || incomingRun <= prevRun) return;
  }

  // mute: ถ้า id ถูก mute จนถึง runId X จะไม่ส่งจนกว่าจะมี runId > X
  const mutedUntil = mutedUntilRunId.get(id) ?? -Infinity;
  const isMuted = incomingRun <= mutedUntil;

  // อัปเดต last state
  lastStateById.set(id, {
    runId: incomingRun || prevRun || 0,
    status: msg.status,
    progress: msg.progress,
    stage: msg.stage,
    // ส่งผ่าน field อื่น ๆ ที่อาจมีเพิ่ม
    ...msg,
  });

  // ถ้าเป็น run ใหม่กว่า ให้ปลด mute อัตโนมัติ
  if (incomingRun > mutedUntil) mutedUntilRunId.delete(id);

  // กระจายให้ subscribers (ถ้ายังไม่ถูก mute)
  if (isMuted) return;
  const set = clientsById.get(id);
  if (!set) return;
  const data = `data: ${JSON.stringify({ id, ...lastStateById.get(id) })}\n\n`;
  for (const { res } of set) {
    try { res.write(data); } catch (_) { }
  }
}

// อนุญาตให้ dismiss ได้ทุกเมื่อ
export function dismiss(id, untilRunId) {
  if (!id) return;
  const last = lastStateById.get(id);
  const base = Number(untilRunId ?? last?.runId ?? 0);
  mutedUntilRunId.set(id, base);

  // ส่ง event แจ้งฝั่ง client ให้ปิดแถบ (optional)
  const set = clientsById.get(id);
  if (!set) return;
  const payload = { id, dismissed: true, untilRunId: base };
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const { res } of set) {
    try { res.write(data); } catch (_) { }
  }
}
