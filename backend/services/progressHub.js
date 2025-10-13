// backend/services/progressHub.js
const clientsById = new Map(); // id -> Set({ res, timer })

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
  const set = clientsById.get(msg.id);
  if (!set) return;
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const { res } of set) {
    try {
      res.write(data);
    } catch (_) {
      // ถ้าเขียนไม่ติด ปล่อยให้ cleanup จาก 'close' event
    }
  }
}
