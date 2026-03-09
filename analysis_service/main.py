# analysis_service/main.py
from fastapi import FastAPI, UploadFile, Form, BackgroundTasks, HTTPException, File
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from services.gcs_uploader import upload_to_gcs
from services.job_store import upsert_job, get_job, get_jobs_bulk, mark_failed, mark_processing, mark_done
from scripts.config.web_config_handler import WebConfigHandler
from scripts.analysis_runner import process_video_analysis
import requests, shutil, os, uuid, json, logging, tempfile, time
import pandas as pd
from dotenv import load_dotenv
from pydantic import BaseModel, Field, AnyUrl
from typing import List, Dict, Optional, Any, Union
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import LifoQueue
from contextlib import contextmanager
from scripts.trackers.rat_body_tracker import RatBodyTracker
import statistics
from collections import defaultdict, Counter
from datetime import datetime

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video_processor")

BACKEND_URL = os.getenv("BACKEND_URL") or "http://127.0.0.1:5000"
FRONTEND_URL = os.getenv("FRONTEND_URL") or "http://127.0.0.1:3000"

app = FastAPI(title="Mouse Analysis Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000", BACKEND_URL, FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

config_handler = WebConfigHandler()

TEMP_DIR = "tmp_uploads"
RESULTS_DIR = "scripts/results"
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(os.path.join(RESULTS_DIR, "videos"), exist_ok=True)
os.makedirs(os.path.join(RESULTS_DIR, "excel"), exist_ok=True)

PROGRESS_SECRET = os.getenv("PROGRESS_SECRET")
if not PROGRESS_SECRET:
    raise RuntimeError("PROGRESS_SECRET must be set")

def _has_cuda():
    if os.getenv("USE_CUDA", "1") != "1":
        return False
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False

HAS_CUDA = _has_cuda()
IO_WORKERS = int(os.getenv("IO_WORKERS", "8"))
TRACKER_INSTANCES = int(os.getenv("TRACKER_INSTANCES") or os.getenv("GPU_WORKERS", "2"))
CPU_WORKERS = int(os.getenv("CPU_WORKERS", "2"))
MAX_WORKERS = TRACKER_INSTANCES if HAS_CUDA else CPU_WORKERS
DEVICE = "cuda" if HAS_CUDA else "cpu"
MODEL_PATH = os.path.join("scripts", "model", "rat_seg.pt")

# ─── Thread pool ───
EXECUTOR = ThreadPoolExecutor(max_workers=IO_WORKERS)

# ─── Tracker pool ───
TRACKER_POOL = LifoQueue()

def _build_tracker(device):
    return RatBodyTracker(MODEL_PATH, device=device, imgsz=640)

try:
    for _ in range(TRACKER_INSTANCES):
        TRACKER_POOL.put(_build_tracker(DEVICE))
    logger.info("Tracker pool ready: %d workers on %s", TRACKER_POOL.qsize(), DEVICE)
except Exception:
    logger.exception("Tracker init failed; trying CPU fallback...")
    try:
        DEVICE = "cpu"
        TRACKER_POOL = LifoQueue()
        TRACKER_POOL.put(_build_tracker("cpu"))
        logger.info("CPU fallback tracker ready")
    except Exception:
        logger.exception("CPU fallback failed – tracker unavailable")
        raise RuntimeError("Tracker initialization failed on both CUDA and CPU")

@contextmanager
def borrow_tracker():
    t = TRACKER_POOL.get()
    try:
        yield t
    finally:
        TRACKER_POOL.put(t)

# ─────────────── Schemas ───────────────
class Box(BaseModel):
    type: str
    x: float
    y: float
    width: float
    height: float
    rotation: float = 0.0

    class Config:
        extra = "allow"

class EllipseTemplate(BaseModel):
    cx: float
    cy: float
    rx: float
    ry: float
    rotationDeg: float = 0.0
    class Config:
        extra = "allow"

class Item(BaseModel):
    id: str
    mouseCode: Optional[str] = None
    src: Union[str, AnyUrl]
    boxes: List[Box] = Field(default_factory=list)
    startSec: float = 0
    endSec: Optional[float] = None
    targetQuadrant: Optional[str] = None
    template: Optional[EllipseTemplate] = None
    runId: Optional[int] = None

    class Config:
        extra = "allow"

class AnalyzeBatchBody(BaseModel):
    mazeType: str
    items: List[Item] = Field(default_factory=list)
    webhookUrl: Optional[str] = None
    testId: Optional[str] = None
    class Config:
        extra = "allow"

class TestVideoPayload(BaseModel):
    mouseCode: Optional[str] = ""
    group: Optional[str] = None
    groupName: Optional[str] = None
    metrics: Dict[str, Any] = {}

class TestReportReq(BaseModel):
    secret: str
    testId: str
    mazeType: str
    videos: List[TestVideoPayload]

# ─────────────── Utils ───────────────
def _norm_maze(s: str) -> str:
    t = (s or "").lower()
    if t in ("elevatedplusmaze", "elevated_plus_maze", "epm"): return "epm"
    if t in ("ymaze", "y_maze"): return "ymaze"
    if t in ("morriswatermaze", "morris_water_maze", "mwm"): return "mwm"
    return t

def _download_to_temp(url: str, timeout_sec: int = 600) -> str:
    TIMEOUT = (10, 60)
    RETRIES = 3
    last_err = None
    for _ in range(RETRIES):
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
                with requests.get(url, stream=True, timeout=TIMEOUT) as r:
                    r.raise_for_status()
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        if chunk: tmp.write(chunk)
                return tmp.name
        except Exception as e:
            last_err = e
            time.sleep(1)
    raise last_err

# ─────────────── push_progress ───────────────
# throttle: ส่ง HTTP ทุก PUSH_INTERVAL วินาที เพื่อลด network overhead
# terminal status (processed/failed) จะส่งทันทีเสมอ
PUSH_INTERVAL = float(os.getenv("PUSH_INTERVAL", "5.0"))
_last_push: Dict[str, float] = {}

def push_progress(job_id: str, progress: float, status: Optional[str] = None,
                  stage: Optional[str] = None, run_id: Optional[int] = None):
    """
    อัปเดต job state ลง MongoDB ก่อนเสมอ (ทุกครั้ง)
    ส่ง HTTP ไปหา backend เฉพาะถ้าถึงเวลา throttle หรือเป็น terminal status
    """
    # 1) เขียน MongoDB ทุกครั้ง (เร็ว/reliable กว่า HTTP)
    upsert_job(job_id, {
        "status": status,
        "percent": float(progress),
        "stage": stage,
        "runId": run_id,
    })

    # 2) HTTP notify ไปหา backend — throttle กัน flood
    is_terminal = status in ("processed", "failed")
    now = time.time()
    if not is_terminal and (now - _last_push.get(job_id, 0) < PUSH_INTERVAL):
        return  # ยังไม่ถึงเวลา ข้ามได้ MongoDB อัปเดตแล้ว

    _last_push[job_id] = now

    payload = {
        "secret": PROGRESS_SECRET,
        "id": job_id,
        "progress": float(progress),
        "status": status,
        "stage": stage,
        "runId": run_id,
    }
    url = f"{BACKEND_URL}/api/progress/push"
    TIMEOUT = (2, 8)
    for attempt in range(3):
        try:
            requests.post(url, json=payload, timeout=TIMEOUT)
            return
        except Exception as e:
            if attempt == 2:
                logger.warning("push_progress HTTP failed for %s: %s", job_id, e)
                return
            time.sleep(0.5 * (2 ** attempt))

# ─────────────── notify_video_report ───────────────
def notify_video_report(job_id, status, result_urls=None, metrics=None, error=None, run_id=None):
    try:
        body = {
            "secret": PROGRESS_SECRET,
            "id": job_id,
            "status": status,
            "resultUrls": result_urls or {},
            "urls": result_urls or {},
            "metrics": metrics or {},
            "error": error,
            "runId": run_id,
        }
        requests.post(f"{BACKEND_URL}/api/videos/internal/report", json=body, timeout=10)
    except Exception as e:
        logger.warning("notify_video_report failed for %s: %s", job_id, e)

# ─────────────── _process_one_item ───────────────
def _process_one_item(maze: str, item: Item) -> dict:
    job_id = item.id
    run_id = int(item.runId or int(time.time() * 1000))
    local_video = None

    try:
        logger.info("[PROC] maze=%s id=%s boxes=%d types=%s",
            maze, job_id, len(item.boxes), [getattr(b, "type", None) for b in item.boxes])

        if maze != "mwm":
            ok, msg = config_handler.validate_bounding_boxes(maze, [b.dict() for b in item.boxes])
            if not ok:
                mark_failed(job_id, msg)
                push_progress(job_id, 0.0, "failed", msg)
                return {"id": job_id, "status": "failed", "error": f"invalid boxes: {msg}"}

        local_video = _download_to_temp(str(item.src))

        start = float(item.startSec or 0)
        end = float(item.endSec) if item.endSec is not None else None
        if end is not None and end <= start:
            end = start + 1.0

        mark_processing(job_id, 0.0, run_id)
        push_progress(job_id, 0.0, "processing", "start", run_id=run_id)

        def hook(p):
            upsert_job(job_id, {
                "status": "processing",
                "percent": p,
                "updatedAt": datetime.utcnow().isoformat(),
            })
            push_progress(job_id, p, "processing", "progress", run_id=run_id)

        boxes = [b.dict() for b in item.boxes]
        if maze == "mwm" and item.template:
            t = item.template
            boxes.append({
                "type": "ellipse",
                "cx": float(t.cx), "cy": float(t.cy),
                "rx": float(t.rx), "ry": float(t.ry),
                "rotation": float(getattr(t, "rotationDeg", 0.0)),
            })

        with borrow_tracker() as tracker:
            outputs = process_video_analysis(
                video_path=local_video,
                maze_type=maze,
                bounding_boxes=boxes,
                start_time=start,
                end_time=end,
                progress_hook=hook,
                tracker=tracker,
                target_quadrant=item.targetQuadrant,
            )

        metrics = outputs.get("analysis_results")
        if not metrics:
            if maze == "epm":
                raw = outputs.get("epm") or {k: v for k, v in outputs.items() if k not in ("output_video", "excel_file")}
                metrics = {"epm": raw}
            elif maze == "ymaze":
                raw = outputs.get("ymaze") or {k: v for k, v in outputs.items() if k not in ("output_video", "excel_file")}
                metrics = {"ymaze": raw}
            elif maze == "mwm":
                raw = outputs.get("mwm") or {k: v for k, v in outputs.items() if k not in ("output_video", "excel_file")}
                metrics = {"mwm": raw}

        logger.info("[PROC] outs id=%s keys=%s has_video=%s has_excel=%s",
            job_id, list(outputs.keys()),
            bool(outputs.get("output_video")), bool(outputs.get("excel_file")))

        if not outputs or not isinstance(outputs, dict):
            raise RuntimeError("process_video_analysis returned no result")

        vid = outputs.get("output_video")
        xls = outputs.get("excel_file")

        if not vid or not os.path.exists(vid):
            raise FileNotFoundError(f"Output video missing: {vid}")
        if not xls or not os.path.exists(xls):
            raise FileNotFoundError(f"Excel file missing: {xls}")

        video_url = upload_to_gcs(vid, "results/videos")
        excel_url = upload_to_gcs(xls, "results/excel")
        logger.info("[PROC] uploaded id=%s video_url=%s excel_url=%s", job_id, video_url, excel_url)

        # ─── cleanup local files ───
        for p in (vid, xls):
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                logger.warning("cleanup outputs failed for %s", job_id, exc_info=True)

        result_urls = {
            "processedVideo": video_url,
            "processedGcsPath": None,
            "excelFile": excel_url,
            "excelGcsPath": None,
        }

        notify_video_report(job_id, "processed", result_urls=result_urls, metrics=metrics, run_id=run_id)

        mark_done(job_id, run_id)
        push_progress(job_id, 1.0, "processed", "done", run_id=run_id)

        return {
            "id": job_id,
            "status": "ok",
            "runId": run_id,
            "metrics": metrics,
            "resultUrls": result_urls,
        }

    except requests.HTTPError as he:
        err = f"download: {str(he)}"
        mark_failed(job_id, err)
        push_progress(job_id, 0.0, "failed", err, run_id=run_id)
        notify_video_report(job_id, "failed", error=err, run_id=run_id)
        return {"id": job_id, "status": "failed", "error": err}

    except Exception as e:
        logger.exception("[PROC] FAILED id=%s: %s", job_id, e)
        err = str(e)
        current_pct = get_job(job_id).get("percent", 0.0)
        mark_failed(job_id, err, current_pct)
        push_progress(job_id, current_pct, "failed", err, run_id=run_id)
        notify_video_report(job_id, "failed", error=err, run_id=run_id)
        return {"id": job_id, "status": "failed", "error": err}

    finally:
        try:
            if local_video and os.path.exists(local_video):
                os.remove(local_video)
        except Exception:
            logger.warning("cleanup tmp failed for %s", job_id, exc_info=True)

# ─────────────── webhook helper ───────────────
def _post_webhook_single(webhook_url: str, secret: str, test_id: str, result: dict, maze: str, run_id: int):
    try:
        payload = {
            "secret": secret,
            "testId": test_id,
            "mazeType": maze,
            "results": [{**result, "runId": run_id}],
        }
        requests.post(
            webhook_url,
            json=payload,
            headers={"x-progress-secret": secret},
            timeout=15,
        )
    except Exception as e:
        logger.warning("webhook(single) post failed: %s", e)

# ─────────────── Endpoints ───────────────

@app.post("/analyze/batch")
def analyze_batch(body: AnalyzeBatchBody):
    """Synchronous batch: รอผลทั้งหมดแล้วค่อย return"""
    maze = _norm_maze(body.mazeType)
    if maze not in ("epm", "ymaze", "mwm"):
        raise HTTPException(status_code=422, detail=f"Unknown maze type: {body.mazeType}")

    futures = [EXECUTOR.submit(_process_one_item, maze, item) for item in body.items]
    results = []
    for f in as_completed(futures):
        try:
            results.append(f.result())
        except Exception as e:
            results.append({"id": "unknown", "status": "failed", "error": str(e)})

    return {"results": results}


@app.post("/analyze/batch_async")
def analyze_batch_async(body: AnalyzeBatchBody):
    """
    Async batch: return ทันที แล้วประมวลผลใน background
    ฝั่งเว็บใช้ endpoint นี้อยู่แล้ว (analyzeTest ใน testController.js)
    """
    maze = _norm_maze(body.mazeType)
    if maze not in ("epm", "ymaze", "mwm"):
        raise HTTPException(status_code=422, detail=f"Unknown maze type: {body.mazeType}")

    webhook_url = getattr(body, "webhookUrl", None)
    test_id = getattr(body, "testId", None)

    for item in body.items:
        # mark pending ทันทีเพื่อให้ฝั่งเว็บ poll เห็น
        upsert_job(item.id, {"status": "pending", "percent": 0.0,
                             "runId": int(item.runId or time.time() * 1000)})

        def _run_and_webhook(it=item):
            res = _process_one_item(maze, it)
            if webhook_url and test_id:
                try:
                    _post_webhook_single(
                        webhook_url, PROGRESS_SECRET, test_id, res, maze,
                        int(getattr(it, "runId", None) or int(time.time() * 1000))
                    )
                except Exception:
                    logger.warning("post webhook failed for %s", it.id, exc_info=True)
            return res

        EXECUTOR.submit(_run_and_webhook)

    return {"accepted": len(body.items)}


@app.post("/analyze")
async def analyze_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    maze_type: str = Form(...),
    bounding_boxes: str = Form(...),
    start_time: float = Form(0),
    end_time: Optional[float] = Form(None),
    target_quadrant: Optional[str] = Form(None),
):
    """Single video upload endpoint"""
    try:
        video_id = str(uuid.uuid4())
        local_video_path = os.path.join(TEMP_DIR, f"{video_id}_{video.filename}")
        video.file.seek(0)
        with open(local_video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

        boxes = json.loads(bounding_boxes)
        mz = _norm_maze(maze_type)
        is_valid, msg = (True, "") if mz == "mwm" else config_handler.validate_bounding_boxes(mz, boxes)
        if not is_valid:
            os.remove(local_video_path)
            raise HTTPException(status_code=422, detail=f"Invalid bounding boxes: {msg}")

        upsert_job(video_id, {"status": "processing", "percent": 0.0})

        background_tasks.add_task(
            run_analysis_task,
            video_id=video_id,
            video_path=local_video_path,
            maze_type=mz,
            bounding_boxes=boxes,
            start_time=start_time,
            end_time=end_time,
            target_quadrant=target_quadrant,
        )

        return JSONResponse({
            "status": "processing",
            "video_id": video_id,
            "message": "Video uploaded successfully, analysis started."
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error uploading video")
        return JSONResponse(status_code=500, content={"error": str(e)})


def run_analysis_task(video_id, video_path, maze_type, bounding_boxes,
                      start_time, end_time, target_quadrant=None):
    """Background task สำหรับ /analyze (single video)"""
    try:
        mark_processing(video_id, 0.0)
        push_progress(video_id, 0.0, "processing", "start")

        def hook(p):
            upsert_job(video_id, {"status": "processing", "percent": p})
            push_progress(video_id, p, "processing")

        with borrow_tracker() as tracker:
            results = process_video_analysis(
                video_path=video_path,
                maze_type=maze_type,
                bounding_boxes=bounding_boxes,
                start_time=start_time,
                end_time=end_time,
                progress_hook=hook,
                tracker=tracker,
                target_quadrant=target_quadrant,
            )

        video_url = upload_to_gcs(results["output_video"], "results/videos")
        excel_url = upload_to_gcs(results["excel_file"], "results/excel")

        upsert_job(video_id, {
            "status": "done",
            "percent": 1.0,
            "video_url": video_url,
            "excel_url": excel_url,
            "analysis_results": results["analysis_results"],
        })
        push_progress(video_id, 1.0, "processed", "done")

        for p in (results["output_video"], results["excel_file"], video_path):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                logger.warning("cleanup failed for %s", p, exc_info=True)

    except Exception as e:
        upsert_job(video_id, {"status": "failed", "percent": 0.0, "error": str(e)})
        push_progress(video_id, 0.0, "failed", str(e))
        logger.exception("Error during analysis")


# ─────────────── Status / Progress endpoints ───────────────

@app.get("/status/{video_id}")
def get_status(video_id: str):
    job = get_job(video_id)
    if job.get("status") == "unknown":
        raise HTTPException(status_code=404, detail="Video not found")
    return {"video_id": video_id, "status": job.get("status")}


@app.get("/progress/{job_id}")
def get_progress(job_id: str):
    """ดึง progress ของ 1 job — poll จากฝั่งเว็บ"""
    return get_job(job_id)


@app.get("/progress")
def get_progress_bulk(ids: str = ""):
    """ดึง progress หลาย job พร้อมกัน ?ids=id1,id2,id3"""
    job_ids = list(filter(None, ids.split(",")))
    if not job_ids:
        return {}
    return get_jobs_bulk(job_ids)


@app.get("/results/{video_id}")
def get_results(video_id: str):
    job = get_job(video_id)
    if job.get("status") not in ("done", "processed"):
        raise HTTPException(status_code=400, detail="Results not ready")
    return {
        "analysis_results": job.get("analysis_results"),
        "video_url": job.get("video_url"),
        "excel_url": job.get("excel_url"),
    }


@app.get("/download/{video_id}/{filetype}")
def download_result(video_id: str, filetype: str):
    job = get_job(video_id)
    if job.get("status") not in ("done", "processed"):
        raise HTTPException(status_code=400, detail="Results not ready")
    if filetype == "video":
        return {"url": job.get("video_url")}
    if filetype == "excel":
        return {"url": job.get("excel_url")}
    raise HTTPException(status_code=400, detail="Invalid file type")


# ─────────────── Report endpoint ───────────────

@app.post("/report/test")
def make_test_report(req: TestReportReq):
    if req.secret != PROGRESS_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")

    maze = _norm_maze(req.mazeType)
    if maze not in ("epm", "ymaze", "mwm"):
        raise HTTPException(status_code=422, detail=f"unknown maze: {req.mazeType}")

    with tempfile.TemporaryDirectory() as td:
        out_path = os.path.join(td, f"{maze}_test_{req.testId}.xlsx")

        if maze == "epm":
            rows = []
            for v in req.videos:
                g = v.groupName or v.group or ""
                m = v.metrics.get("epm", v.metrics)
                if not isinstance(m, dict) or not m:
                    continue
                rows.append({
                    "group": g,
                    "mouse_code": v.mouseCode or "",
                    "open_arm_1": m.get("open_arm_1", 0),
                    "open_arm_2": m.get("open_arm_2", 0),
                    "closed_arm_1": m.get("closed_arm_1", 0),
                    "closed_arm_2": m.get("closed_arm_2", 0),
                    "avg_open_arm": m.get("avg_open_arm", 0),
                    "avg_closed_arm": m.get("avg_closed_arm", 0),
                    "absolute_diff": m.get("absolute_diff", 0),
                })
            if not rows:
                raise HTTPException(status_code=400, detail="no EPM metrics in payload")
            with pd.ExcelWriter(out_path, engine="openpyxl") as w:
                cols = ["group", "mouse_code", "open_arm_1", "open_arm_2",
                        "closed_arm_1", "closed_arm_2", "avg_open_arm", "avg_closed_arm", "absolute_diff"]
                pd.DataFrame(rows)[cols].to_excel(w, index=False, sheet_name="Summary")

        elif maze == "ymaze":
            sum_rows = []
            per_mouse = []
            for v in req.videos:
                ym = v.metrics.get("ymaze", v.metrics)
                if not isinstance(ym, dict) or not ym:
                    continue

                if isinstance(ym.get("sequence"), list):
                    seq = [{"arm": r.get("arm"), "alt": ("" if r.get("alternation") in (None, "") else int(r.get("alternation")))}
                           for r in ym["sequence"]]
                else:
                    arms = ym.get("arm_sequence", []) or []
                    alts = ym.get("alternation_results", []) or []
                    seq = []
                    for i, arm in enumerate(arms):
                        alt = alts[i] if i < len(alts) else None
                        seq.append({"arm": arm, "alt": ("" if alt is None else int(alt))})
                per_mouse.append({"mouse": v.mouseCode or "", "seq": seq})

                s = ym.get("summary", ym)
                total_entries = int(s.get("total_entries", 0))
                noa = int(s.get("no_of_alternations", s.get("alternations", 0)))
                denom = max(0, total_entries - 2)
                alt_pct = float(s.get("alternation_percent", ((noa / denom) * 100 if denom > 0 else 0)))
                sum_rows.append({
                    "group": v.groupName or v.group or "",
                    "mouse_code": v.mouseCode or "",
                    "A_time": float(s.get("A_time", s.get("arm_A_time", 0))),
                    "B_time": float(s.get("B_time", s.get("arm_B_time", 0))),
                    "C_time": float(s.get("C_time", s.get("arm_C_time", 0))),
                    "A_entries": int(s.get("A_entries", s.get("arm_A_entries", 0))),
                    "B_entries": int(s.get("B_entries", s.get("arm_B_entries", 0))),
                    "C_entries": int(s.get("C_entries", s.get("arm_C_entries", 0))),
                    "total_entries": total_entries,
                    "no_of_alternations": noa,
                    "alternation_percent": round(alt_pct, 2),
                })

            if not per_mouse and not sum_rows:
                raise HTTPException(status_code=400, detail="no Y-Maze metrics in payload")

            with pd.ExcelWriter(out_path, engine="openpyxl") as w:
                if per_mouse:
                    max_len = max((len(m["seq"]) for m in per_mouse), default=0)
                    data = {}
                    for m in per_mouse:
                        arms = [x["arm"] for x in m["seq"]] + [""] * (max_len - len(m["seq"]))
                        alts = [x["alt"] for x in m["seq"]] + [""] * (max_len - len(m["seq"]))
                        data[m["mouse"]] = arms
                        data[f"{m['mouse']}_alternation"] = alts
                    pd.DataFrame(data).to_excel(w, index=False, sheet_name="Sequence")

                if sum_rows:
                    cols = ["group", "mouse_code", "A_time", "B_time", "C_time",
                            "A_entries", "B_entries", "C_entries", "total_entries",
                            "no_of_alternations", "alternation_percent"]
                    df = pd.DataFrame(sum_rows)
                    for c in cols:
                        if c not in df.columns: df[c] = None
                    df[cols].to_excel(w, index=False, sheet_name="Summary")

        elif maze == "mwm":
            per_mouse = []
            for v in req.videos:
                m = v.metrics.get("mwm", v.metrics) or {}
                perq = m.get("per_quadrant") or m.get("quadrants") or {}
                row = {
                    "group": v.groupName or v.group or "",
                    "mouse_code": v.mouseCode or "",
                    "Q1": float(perq.get("Q1", 0)),
                    "Q2": float(perq.get("Q2", 0)),
                    "Q3": float(perq.get("Q3", 0)),
                    "Q4": float(perq.get("Q4", 0)),
                    "_tq": (m.get("target_quadrant") or m.get("targetQuadrant") or "").upper() or None,
                    "_tt": float(m.get("target_time", m.get("avg_in_target", 0)) or 0),
                }
                per_mouse.append(row)

            if not per_mouse:
                raise HTTPException(status_code=400, detail="no MWM metrics in payload")

            by_group = defaultdict(list)
            for r in per_mouse:
                by_group[r["group"]].append(r)

            summary_rows = []
            for g, arr in by_group.items():
                tq_list = [r["_tq"] for r in arr if r.get("_tq")]
                tt_list = [r["_tt"] for r in arr]
                tq = None
                if tq_list:
                    try:
                        tq = statistics.mode(tq_list)
                    except statistics.StatisticsError:
                        tq = Counter(tq_list).most_common(1)[0][0]
                avg_tt = (sum(tt_list) / len(tt_list)) if tt_list else 0.0
                summary_rows.append({
                    "group": g,
                    "target_quadrant": tq or "",
                    "avg_target_time": round(avg_tt, 3),
                })

            with pd.ExcelWriter(out_path, engine="openpyxl") as w:
                cols_q = ["group", "mouse_code", "Q1", "Q2", "Q3", "Q4"]
                pd.DataFrame(per_mouse)[cols_q].to_excel(w, index=False, sheet_name="Quadrants")
                pd.DataFrame(summary_rows)[["group", "target_quadrant", "avg_target_time"]].to_excel(
                    w, index=False, sheet_name="Summary")

        url = upload_to_gcs(out_path, "reports")
        return {"ok": True, "url": url}


# ─────────────── RunPod / Health ───────────────

@app.post("/runsync")
async def runsync_handler(request: dict):
    """RunPod serverless handler"""
    input_data = request.get("input", {})
    job_id = input_data.get("job_id")
    video_url = input_data.get("video_url")
    maze_type = _norm_maze(input_data.get("maze_type", ""))

    os.environ["MONGO_URI"] = input_data.get("mongo_uri", os.getenv("MONGO_URI", ""))
    os.environ["GCS_BUCKET"] = input_data.get("gcs_bucket", os.getenv("GCS_BUCKET", ""))
    os.environ["PROGRESS_SECRET"] = input_data.get("progress_secret", os.getenv("PROGRESS_SECRET", ""))
    os.environ["BACKEND_URL"] = input_data.get("backend_url", os.getenv("BACKEND_URL", ""))

    try:
        item = Item(
            id=job_id,
            src=video_url,
            boxes=[Box(**b) for b in input_data.get("bounding_boxes", [])],
            startSec=float(input_data.get("start_time", 0)),
            endSec=input_data.get("end_time"),
            targetQuadrant=input_data.get("target_quadrant"),
        )
        result = _process_one_item(maze_type, item)
        return {"output": result}
    except Exception as e:
        logger.exception("RunPod handler failed")
        return {"output": {"status": "failed", "job_id": job_id, "error": str(e)}}


@app.get("/healthz")
def healthz():
    return {"ok": True, "cuda": HAS_CUDA, "workers": MAX_WORKERS}


# ─────────────── Exception handler ───────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    logger.error("422 payload invalid at %s :: %s", request.url, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# ─────────────── Shutdown ───────────────

@app.on_event("shutdown")
def _shutdown_all():
    try:
        EXECUTOR.shutdown(wait=False, cancel_futures=True)
    except Exception:
        logger.warning("EXECUTOR shutdown error", exc_info=True)

    try:
        while not TRACKER_POOL.empty():
            t = TRACKER_POOL.get_nowait()
            if hasattr(t, "close"):
                try: t.close()
                except Exception: pass
            del t
    except Exception:
        logger.warning("TRACKER_POOL drain error", exc_info=True)

    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass