// context/ProgressCenter.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

const API_BASE = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";
const ANALYSIS_BASE = process.env.RUNPOD_ENDPOINT_URL || window._env_?.ANALYSIS_API || "http://127.0.0.1:8000";

const keyFor = (uid) => `progress:jobs:${uid}`;

const ProgressCtx = createContext(null);

async function fetchVideoStatus(id) {
  const u = auth.currentUser;
  if (!u) throw new Error("unauth");
  const token = await u.getIdToken(true);
  const res = await fetch(`${API_BASE}/api/videos/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("fetch video failed");
  const json = await res.json();
  const v = json?.data || json;

  let status = v?.status || "uploaded";
  let progress = status === "processed" ? 1 : status === "processing" ? 0.8 : 0;

  // Fallback: ถ้า backend ยังไม่อัปเดตสถานะ แต่ analysis_service รู้ผลแล้ว
  if (status !== "processed") {
    try {
      const r2 = await fetch(`${ANALYSIS_BASE}/progress/${id}`);
      if (r2.ok) {
        const p2 = await r2.json();
        const s2 = String(p2?.status || "").toLowerCase();
        if (s2 === "processed" || s2 === "done") {
          status = "processed";
          progress = 1;
        }
      }
    } catch { }
  }

  return { id, status, progress };
}

export function ProgressProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const esRef = useRef(null);
  const tokenRef = useRef("");
  const pollTimerRef = useRef(null);
  const lastMsgAtRef = useRef(0);
  const retryRef = useRef(0);

  // ----- storage -----
  const loadFromStorage = (uid) => {
    try {
      return JSON.parse(localStorage.getItem(keyFor(uid)) || "[]");
    } catch {
      return [];
    }
  };
  const saveToStorage = (uid, arr) => {
    try {
      localStorage.setItem(keyFor(uid), JSON.stringify(arr));
    } catch { }
  };

  // ----- open/close SSE -----
  const openStream = async (ids) => {
    closeStream();
    if (!ids?.length) return;

    const u = auth.currentUser;
    if (!u) return;

    tokenRef.current = await u.getIdToken(true);
    const url = new URL(`${API_BASE}/api/progress/stream`);
    url.searchParams.set("ids", ids.join(","));
    if (tokenRef.current) url.searchParams.set("token", tokenRef.current);

    const es = new EventSource(url.toString());
    es.onopen = () => {
      retryRef.current = 0;
    };
    es.onmessage = (ev) => {
      lastMsgAtRef.current = Date.now();
      try {
        const msg = JSON.parse(ev.data); // { id, status, progress, label? }
        setJobs((prev) => {
          const next = prev.map((j) => {
            if (j.id !== msg.id) return j;
            const { label: _ignore, ...rest } = msg; // กันไม่ให้ทับ label
            return { ...j, ...rest };
          });
          const uid = auth.currentUser?.uid;
          if (uid) saveToStorage(uid, next);
          return next;
        });
      } catch { }
    };
    es.onerror = async () => {
      // ปล่อยให้ browser retry สัก 2-3 รอบ ถ้ายังพังให้ re-open ด้วยโทเคนใหม่
      if (retryRef.current++ > 2) {
        try {
          tokenRef.current = await u.getIdToken(true);
        } catch { }
        closeStream();
        setTimeout(() => openStream(ids), 1500);
      }
    };
    esRef.current = es;
  };

  const closeStream = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  // ----- polling fallback -----
  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // poll ราย id โดยไม่พึ่ง state (ใช้ตอน hydrate ครั้งแรก)
  async function pollIdsOnce(ids) {
    if (!ids?.length) return;
    const updates = await Promise.allSettled(
      ids.map((id) => fetchVideoStatus(id))
    );
    const patch = [];
    for (const u of updates) if (u.status === "fulfilled") patch.push(u.value);
    if (!patch.length) return;
    // อย่าทับ label ที่ตั้งไว้เป็น TestName_MouseCode
    setJobs((prev) => {
      const map = new Map(prev.map((j) => [j.id, j]));
      patch.forEach((p) => {
        const { /* label: _ignore, */ ...rest } = p; // ไม่มี label อยู่แล้ว แต่กันไว้
        map.set(p.id, { ...map.get(p.id), ...rest });
      });
      const next = Array.from(map.values());
      const uid = auth.currentUser?.uid;
      if (uid) saveToStorage(uid, next);
      return next;
    });
  }

  const pollNow = async () => {
    const pending = jobs.filter(
      (j) => !["processed", "failed"].includes(j.status)
    );
    if (!pending.length) return;
    const updates = await Promise.allSettled(
      pending.map((j) => fetchVideoStatus(j.id))
    );
    const patch = [];
    for (const u of updates) if (u.status === "fulfilled") patch.push(u.value);
    if (patch.length) {
      setJobs((prev) => {
        const map = new Map(prev.map((j) => [j.id, j]));
        patch.forEach((p) => {
          const { label: _ignore, ...rest } = p; // อย่าทับ label
          map.set(p.id, { ...map.get(p.id), ...rest });
        });
        const next = Array.from(map.values());
        const uid = auth.currentUser?.uid;
        if (uid) saveToStorage(uid, next);
        return next;
      });
    }
  };

  const ensurePolling = () => {
    stopPolling();
    // เริ่มถ้ามีงานค้าง
    if (jobs.some((j) => !["processed", "failed"].includes(j.status))) {
      pollTimerRef.current = setInterval(() => {
        // ถ้าไม่ได้รับ SSE เกิน 25s ให้ poll
        const silent = Date.now() - (lastMsgAtRef.current || 0) > 25000;
        if (silent) pollNow().catch(() => { });
      }, 8000);
    }
  };

  // ----- public API -----
  const addJobs = (arr) => {
    const u = auth.currentUser;
    if (!arr?.length || !u) return;
    setJobs((prev) => {
      const existing = new Map(prev.map((j) => [j.id, j]));
      arr.forEach((j) =>
        existing.set(j.id, {
          ...existing.get(j.id), // เอาของเก่ามาก่อน
          ...j,                  // ของใหม่ทับ
          status: "queued",     // รีเซ็ตสถานะสำหรับรอบใหม่
          progress: 0,
          ...existing.get(j.id),
          ...j,
        })
      );
      const next = Array.from(existing.values());
      saveToStorage(u.uid, next);
      openStream(next.map((j) => j.id)).catch(() => { });
      return next;
    });
  };

  const removeJob = (id) => {
    const u = auth.currentUser;
    if (!u) return;
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== id);
      saveToStorage(u.uid, next);
      openStream(next.map((j) => j.id)).catch(() => { });
      return next;
    });
  };

  const removeJobsByTestId = (testIds) => {
    if (!auth.currentUser) return;
    const idsSet = new Set(
      (Array.isArray(testIds) ? testIds : [testIds]).filter(Boolean)
    );
    setJobs((prev) => {
      // ตัดทุก job ที่มี testId อยู่ในชุดที่ลบ
      const next = prev.filter((j) => !idsSet.has(j.testId));
      // บันทึก + เปิดสตรีมใหม่เฉพาะ ids ที่เหลือ
      saveToStorage(auth.currentUser.uid, next);
      openStream(next.map((j) => j.id)).catch(() => { });
      return next;
    });
  };

  const refreshOnce = async (id) => {
    try {
      const u = await fetchVideoStatus(id);
      setJobs((prev) => {
        const next = prev.map((j) => {
          if (j.id !== id) return j;
          const { label: _ignore, ...rest } = u;
          return { ...j, ...rest };
        });
        const uid = auth.currentUser?.uid;
        if (uid) saveToStorage(uid, next);
        return next;
      });
    } catch { }
  };

  const signOutCleanup = () => {
    closeStream();
    stopPolling();
    tokenRef.current = "";
    setJobs([]);
  };

  const clearAllForCurrentUser = () => {
    const u = auth.currentUser;
    if (!u) return;
    localStorage.removeItem(keyFor(u.uid));
    closeStream();
    stopPolling();
    setJobs([]);
  };

  const value = useMemo(
    () => ({
      jobs,
      addJobs,
      removeJob,
      removeJobsByTestId,
      clearAllForCurrentUser,
      signOutCleanup,
      refreshOnce,
    }),
    [jobs]
  );

  // ----- auth changes -----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      closeStream();
      stopPolling();
      if (!u) {
        setJobs([]);
        return;
      }

      const stored = loadFromStorage(u.uid);
      setJobs(stored);

      try {
        tokenRef.current = await u.getIdToken(true);
      } catch { }

      const ids = stored.map((j) => j.id);
      openStream(ids).catch(() => { });

      // poll ทันทีด้วย ids ที่มี (ไม่รอ state หรือ interval)
      pollIdsOnce(ids).catch(() => { });

      ensurePolling();
    });
    return () => unsub();
  }, []);

  // เมื่อรายการงานเปลี่ยน ให้จัดการ polling ใหม่
  useEffect(() => {
    ensurePolling();
  }, [jobs]);

  return <ProgressCtx.Provider value={value}>{children}</ProgressCtx.Provider>;
}

export const useProgress = () => useContext(ProgressCtx);
