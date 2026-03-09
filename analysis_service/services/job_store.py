# services/job_store.py
"""
Persistent job state store backed by MongoDB Atlas.

เหตุผลที่ต้องมีไฟล์นี้:
  - เดิม job_progress / processing_status เป็น in-memory dict
  - เมื่อ Modal restart container ทุกอย่างหายหมด
  - ย้ายมาเก็บใน MongoDB ทำให้ container restart แล้ว state ยังอยู่
  - ฝั่งเว็บ poll /progress/{job_id} ได้ตลอด

Usage:
    from services.job_store import upsert_job, get_job, get_jobs_bulk
"""

import os
import time
import logging
from typing import Optional

log = logging.getLogger("job_store")

_client = None
_col_ref = None


def _col():
    """Lazy-init MongoDB collection (singleton per process)."""
    global _client, _col_ref
    if _col_ref is not None:
        return _col_ref
    try:
        from pymongo import MongoClient
        uri = os.environ.get("MONGO_URI", "")
        if not uri:
            raise RuntimeError("MONGO_URI not set")
        _client = MongoClient(
            uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
        )
        db_name = os.environ.get("MONGO_DB", "mouse_analysis")
        _col_ref = _client[db_name]["jobs"]
        # สร้าง index สำหรับ TTL (ลบ job เก่าหลัง 7 วันอัตโนมัติ)
        try:
            _col_ref.create_index("updatedAt", expireAfterSeconds=7 * 24 * 3600)
        except Exception:
            pass
        log.info("[job_store] MongoDB connected, db=%s", db_name)
    except Exception as e:
        log.error("[job_store] MongoDB init failed: %s", e)
        _col_ref = None
    return _col_ref


def upsert_job(job_id: str, data: dict) -> None:
    """
    เขียน/อัปเดต job state ลง MongoDB
    ถ้า MongoDB ล้มเหลวจะ log warning แต่ไม่ raise (ไม่หยุดงาน)
    """
    col = _col()
    if col is None:
        log.warning("[job_store] skipping upsert for %s (no DB)", job_id)
        return
    try:
        col.update_one(
            {"_id": job_id},
            {"$set": {**data, "updatedAt": time.time()}},
            upsert=True,
        )
    except Exception as e:
        log.warning("[job_store] upsert failed for %s: %s", job_id, e)


def get_job(job_id: str) -> dict:
    """
    ดึง job state จาก MongoDB
    คืน {"status": "unknown", "percent": 0.0} ถ้าไม่พบหรือ DB ล้มเหลว
    """
    col = _col()
    if col is None:
        return {"status": "unknown", "percent": 0.0}
    try:
        doc = col.find_one({"_id": job_id}, {"_id": 0})
        if doc:
            # ลบ field internal ที่ไม่ส่งกลับ client
            doc.pop("updatedAt", None)
            return doc
    except Exception as e:
        log.warning("[job_store] get_job failed for %s: %s", job_id, e)
    return {"status": "unknown", "percent": 0.0}


def get_jobs_bulk(job_ids: list[str]) -> dict[str, dict]:
    """
    ดึงหลาย job พร้อมกัน (ใช้สำหรับ /progress?ids=...)
    คืน dict: {job_id: state_dict}
    """
    col = _col()
    out: dict[str, dict] = {}
    if col is None:
        return {jid: {"status": "unknown", "percent": 0.0} for jid in job_ids}
    try:
        docs = col.find(
            {"_id": {"$in": job_ids}},
            {"updatedAt": 0},  # ไม่ส่ง updatedAt กลับ
        )
        for doc in docs:
            jid = doc.pop("_id")
            out[jid] = doc
    except Exception as e:
        log.warning("[job_store] get_jobs_bulk failed: %s", e)

    # เติม job ที่ไม่มีใน DB
    for jid in job_ids:
        if jid not in out:
            out[jid] = {"status": "unknown", "percent": 0.0}
    return out


def mark_failed(job_id: str, error: str, percent: float = 0.0) -> None:
    """Convenience: mark job as failed with error message."""
    upsert_job(job_id, {"status": "failed", "percent": percent, "error": error})


def mark_processing(job_id: str, percent: float = 0.0, run_id: Optional[int] = None) -> None:
    """Convenience: mark job as processing."""
    data: dict = {"status": "processing", "percent": percent}
    if run_id is not None:
        data["runId"] = run_id
    upsert_job(job_id, data)


def mark_done(job_id: str, run_id: Optional[int] = None) -> None:
    """Convenience: mark job as processed/done."""
    data: dict = {"status": "processed", "percent": 1.0}
    if run_id is not None:
        data["runId"] = run_id
    upsert_job(job_id, data)