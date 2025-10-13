# analysis_service/scripts/config/web_config_handler.py
"""
Web Configuration Handler
Handles configuration data between web interface and analysis modules
"""
import json
import os
from datetime import datetime
from typing import List, Tuple


class WebConfigHandler:
    """Handle configuration data from web interface"""
    
    def __init__(self, config_dir='config'):
        self.config_dir = config_dir
        os.makedirs(config_dir, exist_ok=True)
    
    def save_session_config(self, session_data):
        """
        Save session configuration from web interface
        
        Args:
            session_data: Dictionary containing:
                - maze_type
                - bounding_boxes  (list of dicts from UI)
                - video_info
                - analysis_parameters
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"session_{timestamp}.json"
        filepath = os.path.join(self.config_dir, filename)
        
        with open(filepath, 'w', encoding="utf-8") as f:
            json.dump(session_data, f, indent=2, ensure_ascii=False)
        return filepath
    
    def load_session_config(self, filepath):
        """Load previously saved session configuration"""
        with open(filepath, 'r', encoding="utf-8") as f:
            return json.load(f)

    # ----------------------- utils -----------------------

    @staticmethod
    def _coerce_float(v, default=0.0) -> float:
        try:
            return float(v)
        except Exception:
            return float(default)

    @staticmethod
    def _normalize_one_box(box: dict) -> dict:
        """Ensure numeric types and rotation presence."""
        return {
            "type": box.get("type"),
            "x": WebConfigHandler._coerce_float(box.get("x", 0)),
            "y": WebConfigHandler._coerce_float(box.get("y", 0)),
            "width": WebConfigHandler._coerce_float(box.get("width", 0)),
            "height": WebConfigHandler._coerce_float(box.get("height", 0)),
            "rotation": WebConfigHandler._coerce_float(box.get("rotation", 0.0)),
        }

    def normalize_web_boxes(self, bounding_boxes: List[dict]) -> List[dict]:
        """
        Return boxes coerced to numeric fields and with 'rotation' always present.
        Suitable for feeding directly into BaseMaze.set_regions_from_web(...)
        """
        return [self._normalize_one_box(b) for b in (bounding_boxes or [])]

    # ----------------------- validation -----------------------
    def validate_bounding_boxes(self, maze_type: str, bounding_boxes: List[dict]) -> Tuple[bool, str]:
        """
        Validate bounding boxes for specific maze type

        Args:
            maze_type: 'epm', 'ymaze', 'mwm'
            bounding_boxes: List of bounding box definitions

        Returns:
            tuple: (is_valid, error_message)
        """
        if maze_type not in ("epm", "ymaze", "mwm"):
            return False, f"Unknown maze type: {maze_type}"

        # required types
        if maze_type == "epm":
            must_types = {"open_arm_1", "open_arm_2", "closed_arm_1", "closed_arm_2"}
        elif maze_type == "ymaze":
            must_types = {"A", "B", "C"}
        elif maze_type == "mwm":
            must_types = {"Q1", "Q2", "Q3", "Q4"}
        else:
            return False, f"Unsupported maze type: {maze_type}"

        boxes = self.normalize_web_boxes(bounding_boxes or [])

        # required types present?
        legacy_map = {"arm_1": "A", "arm_2": "B", "arm_3": "C"} if maze_type == "ymaze" else {}
        provided_types_raw = [b.get("type") for b in boxes]
        provided_types = [(legacy_map.get(t, t)) for t in provided_types_raw]

        missing = must_types - set(provided_types)
        if missing:
            return False, f"Missing required region types: {sorted(list(missing))}"

        # duplicate required type?
        for t in must_types:
            if provided_types.count(t) > 1:
                return False, f"Duplicate region type: {t}"

        # validate shape fields
        for b in boxes:
            t = b.get("type")
            if t is None:
                return False, "Box missing required field: type"

            # numeric checks
            x = b.get("x"); y = b.get("y")
            w = b.get("width"); h = b.get("height")
            rot = b.get("rotation", 0.0)

            if w is None or h is None:
                return False, f"Box '{t}' missing width/height"
            try:
                w = float(w); h = float(h)
                x = float(x); y = float(y)
                rot = float(rot)
            except Exception:
                return False, f"Box '{t}' has non-numeric fields"

            if w <= 0 or h <= 0:
                return False, f"Box '{t}' dimensions must be positive"

            # rotation can be any float; no range clamp required
            # (downstream will interpret clockwise degrees)

        return True, "Valid"

    # ----------------------- legacy / optional -----------------------

    def convert_web_boxes_to_regions(self, bounding_boxes: List[dict]) -> dict:
        """
        Legacy helper (AABB only). Kept for backward-compat.
        New pipeline should pass boxes directly to BaseMaze.set_regions_from_web(...).
        """
        regions = {}
        for box in bounding_boxes or []:
            nb = self._normalize_one_box(box)
            regions[nb["type"]] = {
                "x1": int(nb["x"]),
                "y1": int(nb["y"]),
                "x2": int(nb["x"] + nb["width"]),
                "y2": int(nb["y"] + nb["height"]),
                # rotation intentionally ignored here (legacy AABB format)
            }
        return regions
