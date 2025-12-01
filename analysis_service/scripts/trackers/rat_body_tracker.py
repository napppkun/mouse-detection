# scripts/trackers/rat_body_tracker.py
import os
import logging
from typing import Dict, Tuple, Optional

import cv2
import numpy as np

log = logging.getLogger("rat_tracker")


class RatBodyTracker:
    """
    ห่อโมเดล Ultralytics YOLO (segmentation) ให้เรียกใช้ง่าย
    คืน dict ต่อเฟรม: { id: {confidence, bbox, mask(np.uint8 HxW 0/255)} }
    """

    def __init__(
        self,
        model_path: str,
        device: Optional[str] = None,
        conf: float = 0.25,
        iou: float = 0.5,
        imgsz: int = 640,
    ):
        self.model = None
        self.model_ok = False
        self.conf = conf
        self.iou = iou
        self.imgsz = imgsz

        # bg-subtractor fallback (ถ้า YOLO ไม่เจอ)
        self.bg = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=16, detectShadows=False
        )

        try:
            from ultralytics import YOLO
        except Exception:
            log.exception("[tracker] ultralytics not installed")
            return

        if not os.path.exists(model_path):
            log.error(f"[tracker] model not found: {model_path}")
            return

        self.device = (device or self._auto_device())
        self.half = False  # บังคับไม่ใช้ half เพื่อกัน dtype mismatch

        try:
            self.model = YOLO(model_path)
            # ย้ายขึ้นอุปกรณ์และบังคับ float32 เสมอ
            self.model.to(self.device)
            try:
                self.model.model.float()
            except Exception:
                pass

            self.model_ok = True
            log.info(f"[tracker] YOLO loaded on {self.device} (half=False, dtype=float32) :: {model_path}")
        except Exception as e:
            log.warning(f"[tracker] init on {self.device} failed: {e} → fallback to CPU")
            self.device = "cpu"
            self.half = False
            try:
                if self.model is None:
                    self.model = YOLO(model_path)
                self.model.to("cpu")
                try:
                    self.model.model.float()
                except Exception:
                    pass
                self.model_ok = True
                log.info("[tracker] YOLO loaded on cpu (half=False, dtype=float32) after fallback")
            except Exception:
                self.model_ok = False

    def _auto_device(self) -> str:
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    # ---------------- internal helpers ----------------
    @staticmethod
    def _bbox_from_mask(mask: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            return None
        x, y, w, h = cv2.boundingRect(max(cnts, key=cv2.contourArea))
        return (x, y, x + w, y + h)

    # ---------------- main API ----------------
    def _parse_yolo_results(self, r, h, w):
        results = {}
        # มี masks
        if r.masks is not None and len(r.masks) > 0:
            masks = r.masks.data.cpu().numpy()
            boxes = r.boxes.xyxy.cpu().numpy() if r.boxes is not None else None
            confs = r.boxes.conf.cpu().numpy() if r.boxes is not None else None
            for i, m in enumerate(masks):
                m = (m * 255).astype(np.uint8)
                m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
                conf = float(confs[i]) if confs is not None and i < len(confs) else 0.0
                if boxes is not None and i < len(boxes):
                    x1, y1, x2, y2 = boxes[i].astype(int)
                    bbox = (int(x1), int(y1), int(x2), int(y2))
                else:
                    bbox = self._bbox_from_mask(m)
                results[i] = {"confidence": conf, "bbox": bbox, "mask": m}
        # ไม่มี mask แต่มี boxes
        elif r.boxes is not None and len(r.boxes) > 0:
            boxes = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()
            for i, b in enumerate(boxes):
                x1, y1, x2, y2 = b.astype(int)
                m = np.zeros((h, w), dtype=np.uint8)
                m[y1:y2, x1:x2] = 255
                results[i] = {"confidence": float(confs[i]), "bbox": (x1, y1, x2, y2), "mask": m}
        return results

    def detect_frame(self, frame: np.ndarray) -> Dict[int, dict]:
        h, w = frame.shape[:2]
        results = {}

        if self.model_ok:
            try:
                r = self.model.track(
                    source=frame,
                    conf=self.conf,
                    iou=self.iou,
                    imgsz=self.imgsz,
                    stream=False,
                    verbose=False,
                    persist=True,
                    device=self.device
                )[0]
                results = self._parse_yolo_results(r, h, w)

            except Exception as e:
                if self.device.startswith("cuda"):
                    log.warning(f"[tracker] CUDA failed during track: {e} → fallback to CPU float32")
                    try:
                        self.model.to("cpu")
                        try:
                            self.model.model.float()
                        except Exception:
                            pass
                    except Exception:
                        pass
                    self.device = "cpu"
                    self.half = False
                    # รันใหม่บน CPU แล้ว “แปลงผล” ด้วย
                    r = self.model.track(
                        source=frame,
                        conf=self.conf,
                        iou=self.iou,
                        imgsz=self.imgsz,
                        stream=False,
                        verbose=False,
                        persist=True,
                        device="cpu"
                    )[0]
                    results = self._parse_yolo_results(r, h, w)
                else:
                    log.exception("[tracker] YOLO inference error on CPU")

        if results:
            return results

        # 2) Fallback BG-subtractor (กันวิดีโอว่าง)
        fg = self.bg.apply(frame)
        fg = cv2.medianBlur(fg, 5)
        _, fg = cv2.threshold(fg, 200, 255, cv2.THRESH_BINARY)
        cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            return {}

        c = max(cnts, key=cv2.contourArea)
        if cv2.contourArea(c) < 100:
            return {}

        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(mask, [c], -1, 255, -1)
        bbox = self._bbox_from_mask(mask)
        return {0: {"confidence": 0.1, "bbox": bbox, "mask": mask}}
