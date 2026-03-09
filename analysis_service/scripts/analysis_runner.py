# analysis_service/scripts/analysis_runner.py
import os
from datetime import datetime

import cv2
import pandas as pd
from typing import Callable, Optional

from scripts.trackers.rat_body_tracker import RatBodyTracker
from scripts.mazes import EPMMaze, YMaze, MWM
from scripts.utils.segment_utils import get_position_from_segment
from scripts.utils.video_utils import _try_open_writer, _force_mp4_path

def get_device():
    try:
        import torch
        use_flag = os.getenv("USE_CUDA", "1") == "1"
        if use_flag and torch.cuda.is_available():
            return torch.device("cuda:0")
    except Exception:
        pass
    return "cpu"

DEVICE = get_device()

# FRAME SKIP CONFIG
# หนูเคลื่อนที่ช้า วิเคราะห์แค่ ANALYSIS_FPS เฟรมต่อวินาทีก็พอ
ANALYSIS_FPS = int(os.getenv("ANALYSIS_FPS", "5"))


def process_video_analysis(
    video_path: str,
    maze_type: str,
    bounding_boxes,
    start_time: float = 0,
    end_time: float | None = None,
    progress_hook: Optional[Callable[[float], None]] = None,
    tracker=None,
    target_quadrant: Optional[str] = None,
):
    """
    core pipeline: open video → YOLO seg → centroid → region/time → overlay → excel

    การเปลี่ยนแปลงจากเดิม:
      - เพิ่ม frame skip: YOLO inference เฉพาะทุก `skip` เฟรม
        → ผลลัพธ์วิดีโอ overlay ยังครบทุก frame (ใช้ centroid/region เดิม)
        → เวลาที่คำนวณยังถูกต้อง (นับจาก dt ของทุกเฟรม ไม่ใช่แค่ที่ inference)
    """
    BASE_DIR = os.path.dirname(__file__)
    MODEL_PATH = os.path.join(BASE_DIR, "model", "rat_seg.pt")
    tracker = tracker or RatBodyTracker(
        MODEL_PATH,
        device=("cuda" if os.getenv("USE_CUDA","1")=="1" else "cpu"),
        imgsz=640,
    )

    # init maze แล้วแทนที่ regions ด้วยของเว็บ
    if maze_type == "epm":
        maze = EPMMaze()
    elif maze_type == "ymaze":
        maze = YMaze()
    elif maze_type == "mwm":
        maze = MWM()
    else:
        raise ValueError(f"Unsupported maze type: {maze_type}")
    maze.set_regions_from_web(maze_type, bounding_boxes)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video")

    # fps/ช่วงเฟรม
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_secs = total_frames / fps if fps else 0
    start_sec = max(0.0, float(start_time or 0))
    end_sec = float(end_time) if end_time is not None else video_secs
    end_sec = max(start_sec, min(end_sec, video_secs))
    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps)
    if end_frame <= start_frame:
        end_frame = min(start_frame + int(10 * fps), total_frames)

    # ─── คำนวณ skip ───
    # skip = ทุกกี่เฟรมถึงจะ inference 1 ครั้ง
    # เช่น fps=30, ANALYSIS_FPS=5 → skip=6 (inference เฉพาะเฟรมที่ 0,6,12,...)
    skip = max(1, round(fps / ANALYSIS_FPS))

    # เตรียม VideoWriter (robust บน Windows)
    ok, sample = cap.read()
    if not ok:
        cap.release()
        raise ValueError("Cannot read first frame")

    h, w = sample.shape[:2]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = os.path.join("scripts", "results", "videos")
    os.makedirs(out_dir, exist_ok=True)

    # ---- Always MP4 (try mp4v/avc1/H264) ----
    out_path = os.path.join(out_dir, f"{maze_type}_results_{ts}.mp4")
    vw, used_codec = _try_open_writer(out_path, fps, (w, h))
    if not vw or not vw.isOpened():
        cap.release()
        raise RuntimeError("Failed to open MP4 writer (tried mp4v/avc1/H264)")

    # กลับไปเริ่มจาก start_frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    # counters
    dt = 1.0 / fps
    timers: dict[str, float] = {}
    entries: dict[str, int] = {}
    arm_sequence: list[str] = []
    epm_raw_times = {
        "open_arm_1": 0.0,
        "open_arm_2": 0.0,
        "closed_arm_1": 0.0,
        "closed_arm_2": 0.0,
    }

    trajectory = []
    last_sample_time = 0.0
    SAMPLE_INTERVAL = 1.0  # วินาที

    prev_region = None
    # centroid สุดท้ายที่ inference เจอ (ใช้ซ้ำในเฟรมที่ skip)
    last_centroid = None
    last_det_region = None

    frame_idx = start_frame
    total_steps = max(1, end_frame - start_frame)

    while cap.get(cv2.CAP_PROP_POS_FRAMES) < end_frame:
        ret, frame = cap.read()
        if not ret:
            break

        current_time = (frame_idx - start_frame) * dt
        steps_done = frame_idx - start_frame

        # ─── ตัดสินใจว่า inference เฟรมนี้หรือเปล่า ───
        should_infer = (steps_done % skip == 0)

        if should_infer:
            det = tracker.detect_frame(frame)
            centroid = None
            if det:
                best = max(det.items(), key=lambda kv: kv[1].get("confidence", 0))[1]
                m = best.get("mask")
                if m is not None:
                    centroid = get_position_from_segment(m)
                else:
                    x1, y1, x2, y2 = best.get("bbox") or (0, 0, 0, 0)
                    centroid = ((x1 + x2) // 2, (y1 + y2) // 2)

            # region จาก inference ใหม่
            region = maze.get_region_for_position(centroid)
            last_centroid = centroid
            last_det_region = region
        else:
            # ใช้ centroid/region จาก inference ล่าสุด (ประหยัด GPU)
            centroid = last_centroid
            region = last_det_region

        # ─── นับเวลา (ทุกเฟรม เพื่อให้ถูกต้อง) ───
        if region:
            timers[region] = timers.get(region, 0.0) + dt

        # ─── trajectory sampling ───
        should_sample = (
            (current_time - last_sample_time >= SAMPLE_INTERVAL) or
            (prev_region != region) or
            (frame_idx == start_frame) or
            (cap.get(cv2.CAP_PROP_POS_FRAMES) >= end_frame - 1)
        )
        if should_sample and centroid:
            trajectory.append({
                "t": round(current_time, 2),
                "x": int(centroid[0]),
                "y": int(centroid[1]),
                "region": region or "unknown"
            })
            last_sample_time = current_time

        # ─── Y-maze arm entry (เฉพาะเฟรม inference เพื่อกัน double-count) ───
        if maze_type == "ymaze" and should_infer:
            def is_arm(z): return z in ("A", "B", "C")
            if prev_region != region and region and is_arm(region):
                arm_sequence.append(region)
                entries[region] = entries.get(region, 0) + 1

        # ─── EPM raw time ───
        if maze_type == "epm" and region in epm_raw_times:
            epm_raw_times[region] += dt

        # ─── draw overlay (ทุกเฟรม ให้วิดีโอ output ลื่นปกติ) ───
        if centroid is not None:
            cv2.circle(frame, centroid, 6, (0, 0, 255), -1)
        frame = maze.draw_maze(frame, active_region=region, timers=timers)
        vw.write(frame)

        prev_region = region
        frame_idx += 1

        # ─── progress hook (throttle: ทุก 1 วินาทีของวิดีโอ) ───
        if progress_hook and steps_done % int(max(1, fps)) == 0:
            pct = steps_done / total_steps
            progress_hook(min(0.99, max(0.0, float(pct))))

    cap.release()
    vw.release()

    # trajectory metadata
    trajectory_metadata = {
        "trajectory": trajectory,
        "videoDimensions": {"width": w, "height": h},
        "sampleInterval": SAMPLE_INTERVAL,
        "totalPoints": len(trajectory),
        "duration": round((frame_idx - start_frame) / fps, 2)
    }

    # ─────────────────────────── Excel ───────────────────────────

    # EPM analysis
    if maze_type == "epm":
        open1 = epm_raw_times.get("open_arm_1", 0.0)
        open2 = epm_raw_times.get("open_arm_2", 0.0)
        closed1 = epm_raw_times.get("closed_arm_1", 0.0)
        closed2 = epm_raw_times.get("closed_arm_2", 0.0)
        avg_open = (open1 + open2) / 2.0
        avg_closed = (closed1 + closed2) / 2.0
        abs_diff = abs(avg_open - avg_closed)

        excel_path = os.path.join("scripts", "results", "excel", f"epm_results_{ts}.xlsx")
        os.makedirs(os.path.dirname(excel_path), exist_ok=True)
        with pd.ExcelWriter(excel_path, engine="openpyxl") as w:
            pd.DataFrame([{
                "open_arm_1": round(open1, 2),
                "open_arm_2": round(open2, 2),
                "closed_arm_1": round(closed1, 2),
                "closed_arm_2": round(closed2, 2),
                "avg_open_arm": round(avg_open, 2),
                "avg_closed_arm": round(avg_closed, 2),
                "absolute_diff": round(abs_diff, 2),
            }]).to_excel(w, index=False, sheet_name="Summary")

        analysis_results = {
            "epm": {
                "open_arm_1": round(open1, 2),
                "open_arm_2": round(open2, 2),
                "closed_arm_1": round(closed1, 2),
                "closed_arm_2": round(closed2, 2),
                "avg_open_arm": round(avg_open, 2),
                "avg_closed_arm": round(avg_closed, 2),
                "absolute_diff": round(abs_diff, 2),
            },
            "trajectory_metadata": trajectory_metadata,
        }

        return {
            "tracking_data": None,
            "analysis_results": analysis_results,
            "excel_file": excel_path,
            "output_video": out_path,
            "total_frames_processed": frame_idx - start_frame,
            "duration_processed": (frame_idx - start_frame) / fps,
        }

    # YMaze analysis
    elif maze_type == "ymaze":
        n = len(arm_sequence)
        alternation_results = [None] * n

        no_of_alternation = 0
        for i in range(2, n):
            triplet = arm_sequence[i-2:i+1]
            is_alt = 1 if len(set(triplet)) == 3 else 0
            alternation_results[i] = is_alt
            if is_alt:
                no_of_alternation += 1

        rows = []
        for idx, (arm, alt) in enumerate(zip(arm_sequence, alternation_results), start=1):
            display_alt = "" if alt is None else alt
            rows.append({"entry": idx, "arm": arm, "alternation": display_alt})

        total_entries = len(arm_sequence)
        denom = max(1, total_entries - 2)
        alternation_percent = (no_of_alternation / denom) * 100.0

        A_time = round(timers.get("A", 0.0), 2)
        B_time = round(timers.get("B", 0.0), 2)
        C_time = round(timers.get("C", 0.0), 2)

        excel_path = os.path.join("scripts", "results", "excel", f"ymaze_results_{ts}.xlsx")
        os.makedirs(os.path.dirname(excel_path), exist_ok=True)

        sequence_rows = []
        for idx, (arm, alt) in enumerate(zip(arm_sequence, alternation_results), start=1):
            display_alt = "" if alt is None else alt
            sequence_rows.append({"entry": idx, "arm": arm, "alternation": display_alt})

        with pd.ExcelWriter(excel_path, engine="openpyxl") as w:
            pd.DataFrame(sequence_rows).to_excel(w, index=False, sheet_name="Sequence")
            pd.DataFrame([{
                "A_entries": entries.get("A", 0),
                "B_entries": entries.get("B", 0),
                "C_entries": entries.get("C", 0),
                "total_entries": total_entries,
                "no_of_alternations": no_of_alternation,
                "alternation_percent": round(alternation_percent, 2),
                "time_A": A_time,
                "time_B": B_time,
                "time_C": C_time,
            }]).to_excel(w, index=False, sheet_name="Summary")

        analysis_results = {
            "ymaze": {
                "summary": {
                    "A_entries": entries.get("A", 0),
                    "B_entries": entries.get("B", 0),
                    "C_entries": entries.get("C", 0),
                    "total_entries": total_entries,
                    "no_of_alternations": no_of_alternation,
                    "alternation_percent": round(alternation_percent, 2),
                    "time_A": A_time,
                    "time_B": B_time,
                    "time_C": C_time,
                },
                "sequence": sequence_rows,
                "arm_sequence": arm_sequence,
                "alternation_results": alternation_results,
            },
            "trajectory_metadata": trajectory_metadata,
        }

        return {
            "tracking_data": None,
            "analysis_results": analysis_results,
            "excel_file": excel_path,
            "output_video": out_path,
            "total_frames_processed": frame_idx - start_frame,
            "duration_processed": (frame_idx - start_frame) / fps,
        }

    # MWM analysis
    elif maze_type == "mwm":
        Qs = ["Q1", "Q2", "Q3", "Q4"]
        q_times = {q: round(timers.get(q, 0.0), 3) for q in Qs}

        tquad = (target_quadrant or "Q1").upper()
        if tquad not in Qs:
            tquad = "Q1"

        target_time = round(q_times.get(tquad, 0.0), 3)

        excel_path = os.path.join("scripts", "results", "excel", f"mwm_results_{ts}.xlsx")
        os.makedirs(os.path.dirname(excel_path), exist_ok=True)
        with pd.ExcelWriter(excel_path, engine="openpyxl") as w:
            pd.DataFrame([{
                "Q1": q_times["Q1"],
                "Q2": q_times["Q2"],
                "Q3": q_times["Q3"],
                "Q4": q_times["Q4"],
                "target_quadrant": tquad,
                "target_time": target_time,
            }]).to_excel(w, index=False, sheet_name="Summary")

        analysis_results = {
            "mwm": {
                "per_quadrant": q_times,
                "target_quadrant": tquad,
                "target_time": target_time,
            },
            "trajectory_metadata": trajectory_metadata,
        }

        return {
            "tracking_data": None,
            "analysis_results": analysis_results,
            "excel_file": excel_path,
            "output_video": out_path,
            "total_frames_processed": frame_idx - start_frame,
            "duration_processed": round((frame_idx - start_frame) / fps, 3),
        }

    else:
        raise ValueError("Unsupported maze type")