"""
Base Maze Class - Foundation for all maze types
Provides common functionality for EPM, Y-Maze, and future maze implementations
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Tuple, Optional
import cv2
import numpy as np
from dataclasses import dataclass
import json
from scripts.utils.geom import point_in_rotated_rect

@dataclass
class ZoneConfig:
    """Configuration for a single zone/region in the maze"""
    name: str
    color: Tuple[int, int, int]  # BGR color for visualization
    roi_points: List[Tuple[int, int]]  # Polygon points defining the zone
    is_entry_zone: bool = False  # Whether entries to this zone are counted
    # --- NEW: raw rotated-rect definition from web (optional) ---
    rect_x: Optional[float] = None
    rect_y: Optional[float] = None
    rect_w: Optional[float] = None
    rect_h: Optional[float] = None
    rotation: float = 0.0                    # degrees (clockwise)
    # ellipse (optional)
    ell_cx: Optional[float] = None
    ell_cy: Optional[float] = None
    ell_rx: Optional[float] = None
    ell_ry: Optional[float] = None
    ell_rot: float = 0.0  # degrees (clockwise)


@dataclass
class MazeConfig:
    """Complete maze configuration"""
    maze_type: str
    zones: List[ZoneConfig]
    center_zone: Optional[str] = None
    frame_width: int = 640
    frame_height: int = 480
    
def _rotated_rect_box_points(x, y, w, h, rotation_deg):
    """
    Return 4 corner points (int) of a rotated rectangle defined by top-left (x,y),
    size (w,h), and rotation degrees (clockwise). Uses cv2.boxPoints.
    """
    cx = x + w / 2.0
    cy = y + h / 2.0
    rect = ((cx, cy), (w, h), rotation_deg)
    box = cv2.boxPoints(rect)  # 4x2 float, order arbitrary
    box = np.int32(box).tolist()
    return [(int(px), int(py)) for px, py in box]

def _point_in_rotated_ellipse(px, py, cx, cy, rx, ry, rot_deg):
    import math
    if rx <= 0 or ry <= 0: 
        return False
    theta = -math.radians(rot_deg)  # หมุนพอยท์ย้อนกลับ
    dx = px - cx; dy = py - cy
    xr = dx*math.cos(theta) - dy*math.sin(theta)
    yr = dx*math.sin(theta) + dy*math.cos(theta)
    return (xr*xr)/(rx*rx) + (yr*yr)/(ry*ry) <= 1.0

def _ellipse_sector_points(cx, cy, rx, ry, rot_deg, start_deg, end_deg, step=6):
    import math
    theta = math.radians(rot_deg)
    pts = [(cx, cy)]
    for a in range(int(start_deg), int(end_deg)+1, step):
        ra = math.radians(a)
        xl = rx * math.cos(ra)
        yl = ry * math.sin(ra)
        xg = int(cx + xl*math.cos(theta) + yl*math.sin(theta))
        yg = int(cy - xl*math.sin(theta) + yl*math.cos(theta))
        pts.append((xg, yg))
    pts.append((cx, cy))
    return np.array(pts, dtype=np.int32)

    
class BaseMaze(ABC):
    """
    Abstract base class for all maze types.
    Provides common functionality for zone management, ROI checking, and position tracking.
    """
    
    def __init__(self, config: MazeConfig):
        """
        Initialize the maze with configuration
        
        Args:
            config: MazeConfig object containing zone definitions and settings
        """
        self.config = config
        self.zones: Dict[str, ZoneConfig] = {}
        self.zone_colors: Dict[str, Tuple[int, int, int]] = {}
        self.current_zone: Optional[str] = None
        self.previous_zone: Optional[str] = None
        self.position_history: List[Tuple[str, float]] = []  # (zone_name, timestamp)
        self.regions = []
        self.ellipse = None   # สำหรับ MWM: {"cx","cy","rx","ry","rot"}
        self.mwm_ellipse = None
        self.target_quadrant: Optional[str] = None
        
        # Setup zones from config
        self._setup_zones()
        self.validate_setup()

    def set_target_quadrant(self, q: Optional[str]):
        self.target_quadrant = (q or "").upper() or None
    
    def _setup_zones(self):
        """Setup zones from configuration"""
        for zone_config in self.config.zones:
            self.zones[zone_config.name] = zone_config
            self.zone_colors[zone_config.name] = zone_config.color
    
    @abstractmethod
    def setup_roi_zones(self) -> Dict[str, List[Tuple[int, int]]]:
        """
        Setup ROI zones specific to the maze type.
        Must be implemented by each maze subclass.
        
        Returns:
            Dictionary mapping zone names to their ROI polygon points
        """
        pass
    
    @abstractmethod
    def get_zone_names(self) -> List[str]:
        """
        Get list of all zone names for this maze type.
        
        Returns:
            List of zone names
        """
        pass
    
    def check_rat_position(self, centroid: Tuple[int, int]) -> Optional[str]:
        if centroid is None:
            return None
        return self.get_region_for_position(centroid)
    
    def update_position(self, centroid: Tuple[int, int], timestamp: float):
        """
        Update the rat's position and track zone changes.
        
        Args:
            centroid: Current rat centroid position
            timestamp: Current timestamp in seconds
        """
        current_zone = self.check_rat_position(centroid)
        
        # Update zone history if zone changed
        if current_zone != self.current_zone:
            self.previous_zone = self.current_zone
            self.current_zone = current_zone
            
            if current_zone is not None:
                self.position_history.append((current_zone, timestamp))
    
    def get_zone_colors(self) -> Dict[str, Tuple[int, int, int]]:
        """
        Get colors for each zone for visualization.
        
        Returns:
            Dictionary mapping zone names to BGR colors
        """
        return self.zone_colors.copy()
    
    def get_current_zone(self) -> Optional[str]:
        """Get the current zone the rat is in"""
        return self.current_zone
    
    def get_previous_zone(self) -> Optional[str]:
        """Get the previous zone the rat was in"""
        return self.previous_zone
    
    def get_position_history(self) -> List[Tuple[str, float]]:
        """Get complete position history"""
        return self.position_history.copy()
    
    def is_valid_transition(self, from_zone: Optional[str], to_zone: Optional[str]) -> bool:
        """
        Check if a zone transition is valid (can be overridden by subclasses).
        
        Args:
            from_zone: Previous zone name
            to_zone: Current zone name
            
        Returns:
            True if transition is valid, False otherwise
        """
        # Base implementation: all transitions are valid
        return True
    
    def get_zone_roi(self, zone_name: str) -> Optional[List[Tuple[int, int]]]:
        """
        Get ROI points for a specific zone.
        
        Args:
            zone_name: Name of the zone
            
        Returns:
            List of polygon points or None if zone doesn't exist
        """
        if zone_name in self.zones:
            return self.zones[zone_name].roi_points.copy()
        return None
    
    def reset_tracking(self):
        """Reset all tracking data"""
        self.current_zone = None
        self.previous_zone = None
        self.position_history.clear()
    
    def validate_setup(self) -> bool:
        """
        Validate the maze setup.
        
        Returns:
            True if setup is valid, False otherwise
        """
        # Check if we have at least one zone
        if not self.zones:
            # สำหรับ MWM เราอนุญาต empty zones เพื่อใช้ ellipse-only workflow
            if str(self.config.maze_type).lower() == "mwm":
                return True
            raise ValueError("Maze must have at least one zone defined")
        
        # Check if all zones have either a polygon (>=3 pts) OR a valid rect
        for zone_name, zone_config in self.zones.items():
            has_poly = len(zone_config.roi_points) >= 3
            has_rect = (
                zone_config.rect_x is not None and
                zone_config.rect_y is not None and
                isinstance(zone_config.rect_w, (int, float)) and zone_config.rect_w > 0 and
                isinstance(zone_config.rect_h, (int, float)) and zone_config.rect_h > 0
            )
            if not (has_poly or has_rect):
                raise ValueError(
                    f"Zone '{zone_name}' must have roi_points (>=3) "
                    f"or a valid rect (x,y,w,h)."
                )
        
        # Check if center zone exists (if specified)
        if self.config.center_zone and self.config.center_zone not in self.zones:
            raise ValueError(f"Center zone '{self.config.center_zone}' not found in zone definitions")
        
        return True
    
    def export_config(self, filepath: str):
        """
        Export maze configuration to JSON file.
        
        Args:
            filepath: Path to save the configuration file
        """
        config_dict = {
            'maze_type': self.config.maze_type,
            'frame_width': self.config.frame_width,
            'frame_height': self.config.frame_height,
            'center_zone': self.config.center_zone,
            'zones': []
        }
        
        for zone_name, zone_config in self.zones.items():
            zone_dict = {
                'name': zone_config.name,
                'color': zone_config.color,
                'roi_points': zone_config.roi_points,
                'is_entry_zone': zone_config.is_entry_zone
            }
            config_dict['zones'].append(zone_dict)
        
        with open(filepath, 'w') as f:
            json.dump(config_dict, f, indent=2)
    
    @classmethod
    def load_config(cls, filepath: str) -> 'MazeConfig':
        """
        Load maze configuration from JSON file.
        
        Args:
            filepath: Path to the configuration file
            
        Returns:
            MazeConfig object
        """
        with open(filepath, 'r') as f:
            config_dict = json.load(f)
        
        zones = []
        for zone_dict in config_dict['zones']:
            zone_config = ZoneConfig(
                name=zone_dict['name'],
                color=tuple(zone_dict['color']),
                roi_points=[(x, y) for x, y in zone_dict['roi_points']],
                is_entry_zone=zone_dict.get('is_entry_zone', False)
            )
            zones.append(zone_config)
        
        return MazeConfig(
            maze_type=config_dict['maze_type'],
            zones=zones,
            center_zone=config_dict.get('center_zone'),
            frame_width=config_dict.get('frame_width', 640),
            frame_height=config_dict.get('frame_height', 480)
        )
    
    # Private helper methods
    def _point_in_polygon_with_counter(self, point: Tuple[int, int], polygon: List[Tuple[int, int]]) -> bool:
        """Version with explicit counter for better understanding"""
        x, y = point
        n = len(polygon)
        intersection_count = 0  # นับจำนวนครั้งที่ตัด
        p1x, p1y = polygon[0]
    
        for i in range(1, n + 1):
            p2x, p2y = polygon[i % n]
        
            # เงื่อนไขเดียวกัน
            if y > min(p1y, p2y) and y <= max(p1y, p2y) and x <= max(p1x, p2x):
                if p1y != p2y:
                    xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        intersection_count += 1  # นับเพิ่ม
        
            p1x, p1y = p2x, p2y
    
        # ถ้าตัดเป็นจำนวนคี่ = อยู่ภายใน
        return intersection_count % 2 == 1
    
    def _get_polygon_center(self, points: np.ndarray) -> Tuple[int, int]:
        """
        Get the center point of a polygon.
        
        Args:
            points: Array of polygon vertices
            
        Returns:
            (x, y) coordinates of the center
        """
        moments = cv2.moments(points)
        if moments['m00'] != 0:
            cx = int(moments['m10'] / moments['m00'])
            cy = int(moments['m01'] / moments['m00'])
            return (cx, cy)
        else:
            # Fallback to simple average
            cx = int(np.mean(points[:, 0]))
            cy = int(np.mean(points[:, 1]))
            return (cx, cy)
        
    # --- ADD: utils for web-defined rectangles -----------------
    def set_regions_from_web(self, maze_type: str, bounding_boxes: list):
        """
        bounding_boxes: [
        {"type": "...", "x":..., "y":..., "width":..., "height":..., "rotation": <deg optional>},
        ...
        ]
        EPM expects: open_arm_1, open_arm_2, closed_arm_1, closed_arm_2
        Y-maze expects: arm_A, arm_B, arm_C
        """
        name_map = {}
        if maze_type == "epm":
            name_map = {
                "open_arm_1": ("open_arm_1", (0,255,0)),
                "open_arm_2": ("open_arm_2", (0,255,0)),
                "closed_arm_1": ("closed_arm_1", (0,200,255)),
                "closed_arm_2": ("closed_arm_2", (0,200,255)),
            }
        elif maze_type == "ymaze":
            # รองรับทั้ง payload ใหม่ (A/B/C) และ legacy (arm_1..3)
            name_map = {
                "A": ("A", (255,0,0)),
                "B": ("B", (0,255,0)),
                "C": ("C", (0,0,255)),
                "arm_1": ("A", (255,0,0)),
                "arm_2": ("B", (0,255,0)),
                "arm_3": ("C", (0,0,255)),
            }
        elif maze_type == "mwm":
            name_map = {
                "quadrant_1": ("Q1", (255, 0, 0)),
                "quadrant_2": ("Q2", (0, 255, 0)),
                "quadrant_3": ("Q3", (0, 0, 255)),
                "quadrant_4": ("Q4", (255, 255, 0)),
            }
        else:
            raise ValueError(f"Unsupported maze_type for web regions: {maze_type}")

        new_zones: Dict[str, ZoneConfig] = {}
        ellipse_cfg = None

        for box in bounding_boxes:
            t = box["type"]
            if t == "ellipse":
                # รักษา normalize ชื่อ key
                self.mwm_ellipse = {
                    "cx": float(box.get("cx", box.get("x", 0))),
                    "cy": float(box.get("cy", box.get("y", 0))),
                    "rx": float(box.get("rx", box.get("width", 0))/1.0),
                    "ry": float(box.get("ry", box.get("height", 0))/1.0),
                    "rot": float(box.get("rotation", box.get("rotationDeg", 0.0))),
                }
                self.regions.append({"type": "ellipse", **self.mwm_ellipse})
                ellipse_cfg = dict(self.mwm_ellipse)
                continue

            if t not in name_map:
                continue

            name, color = name_map[t]
            x = float(box["x"]); y = float(box["y"])
            w = float(box["width"]); h = float(box["height"])
            rot = float(box.get("rotation", 0.0))

            # build polygon points from rotated rect (so draw() ยังใช้ได้)
            poly = _rotated_rect_box_points(x, y, w, h, rot)

            new_zones[name] = ZoneConfig(
                name=name,
                color=color,
                roi_points=poly,
                is_entry_zone=True,
                rect_x=x, rect_y=y, rect_w=w, rect_h=h, rotation=rot
            )

        # เก็บวงรี (ถ้ามี) เพื่อใช้ใน get_region_for_position/draw_maze
        if maze_type == "mwm":
            self.ellipse = ellipse_cfg

        self.zones = new_zones
        self.zone_colors = {zn: zc.color for zn, zc in new_zones.items()}

        # สำหรับ MWM อนุญาตให้ไม่มีโซนสี่เหลี่ยมได้ถ้ามี ellipse
        if maze_type == "mwm" and self.ellipse:
            return True
        self.validate_setup()

    def get_region_for_position(self, centroid):
        """Rotation-aware hit-test using raw rect if available, else polygon fallback."""
        if centroid is None:
            return None
        x, y = centroid

        # --- Special case: MWM ellipse → คืน Q1..Q4 ---
        if self.mwm_ellipse and not self.zones:
            e = self.mwm_ellipse
            if not _point_in_rotated_ellipse(x, y, e["cx"], e["cy"], e["rx"], e["ry"], e["rot"]):
                return None
            # แปลงเป็น local coords เพื่อตัดควอดรันต์
            import math
            theta = -math.radians(e["rot"])
            dx, dy = x - e["cx"], y - e["cy"]
            xr = dx*math.cos(theta) - dy*math.sin(theta)
            yr = dx*math.sin(theta) + dy*math.cos(theta)
            # mapping: Q1 = +x,+y; Q2 = -x,+y; Q3 = -x,-y; Q4 = +x,-y
            if xr >= 0 and yr >= 0: return "Q1"
            if xr <  0 and yr >= 0: return "Q2"
            if xr <  0 and yr <  0: return "Q3"
            return "Q4"

        # --- ปกติ: ใช้โซนสี่เหลี่ยม/โพลิกอน ---
        for zn, zc in self.zones.items():
        # If zone has raw rotated-rect definition, use that (fast & precise)
            if (
                zc.rect_x is not None and zc.rect_y is not None and
                zc.rect_w is not None and zc.rect_h is not None
            ):
                if point_in_rotated_rect(
                    x, y,
                    zc.rect_x, zc.rect_y, zc.rect_w, zc.rect_h,
                    zc.rotation
                ):
                    return zn
            else:
                # Fallback: polygon contains test
                if self._point_in_polygon((x, y), zc.roi_points):
                    return zn
        return None

    def draw_maze(self, frame: np.ndarray, active_region: Optional[str] = None, timers: Optional[Dict[str, float]] = None,
        fill_alpha_active: float = 0.35, fill_alpha_inactive: float = 0.15, target_quadrant: Optional[str] = None, ) -> np.ndarray:
        """
        วาดโซนทั้งหมด (รองรับ rotated-rect) + วาดเวลาในแต่ละโซน (ถ้ามี timers)
        active_region: ชื่อโซนที่จะไฮไลท์
        """
        overlay = frame.copy()
        tq = (target_quadrant or self.target_quadrant or "").upper() or None

        for name, cfg in self.zones.items():
            # ใช้ polygon ที่คำนวณจาก rect (ถ้ามี) เป็นหลัก
            if (
                cfg.rect_x is not None and cfg.rect_y is not None and
                cfg.rect_w is not None and cfg.rect_h is not None
            ):
                pts = np.array(
                    _rotated_rect_box_points(cfg.rect_x, cfg.rect_y, cfg.rect_w, cfg.rect_h, cfg.rotation),
                    dtype=np.int32
                )
            else:
                pts = np.array(cfg.roi_points, dtype=np.int32)

            # fill + border
            alpha = fill_alpha_active if name == active_region else fill_alpha_inactive
            color = cfg.color
            cv2.fillPoly(overlay, [pts], color)
            thickness = 4 if name == active_region else 2
            cv2.polylines(frame, [pts], True, color, thickness)

            # label โซน (มุมบนสุดของโพลิกอน)
            top_idx = int(np.argmin(pts[:, 1]))
            tx, ty = int(pts[top_idx, 0]), int(pts[top_idx, 1]) - 6
            cv2.putText(frame, name, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

            # label เวลา (ถ้าให้มา)
            if timers and name in timers:
                cx = int(np.mean(pts[:, 0])); cy = int(np.mean(pts[:, 1]))
                txt = f"{timers[name]:.2f}s"
                (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(frame, (cx - tw//2 - 6, cy - th - 10), (cx + tw//2 + 6, cy + 6), (50,50,50), -1)
                cv2.putText(frame, txt, (cx - tw//2, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)

        # วาดวงรีสำหรับ MWM (แบ่งควอดรันต์ + ป้ายเวลา Q1..Q4)
        ellipse_src = self.ellipse or self.mwm_ellipse
        if (self.config.maze_type == "mwm") and ellipse_src:
            cx = int(ellipse_src["cx"]); cy = int(ellipse_src["cy"])
            rx = int(ellipse_src["rx"]); ry = int(ellipse_src["ry"])
            rot = float(ellipse_src["rot"])

            qAngles = {
                "Q1": (0, 90),
                "Q2": (90, 180),
                "Q3": (180, 270),
                "Q4": (270, 360),
            }
            if tq in qAngles:
                a1, a2 = qAngles[tq]
                sector_pts = _ellipse_sector_points(cx, cy, rx, ry, rot, a1, a2, step=4)
                # ทับลง overlay แบบโปร่งใส
                cv2.fillPoly(overlay, [sector_pts], (0, 200, 255))

            # วาดขอบวงรี
            cv2.ellipse(frame, (cx, cy), (rx, ry), rot, 0, 360, (255,255,255), 2)

            # วาดเส้นแกน (แบ่ง 4 ส่วน)
            import math
            theta = math.radians(rot)
            # แกน x' (แนวนอนของ local frame)
            x1 = int(cx - rx*math.cos(theta)); y1 = int(cy - rx*math.sin(theta))
            x2 = int(cx + rx*math.cos(theta)); y2 = int(cy + rx*math.sin(theta))
            cv2.line(frame, (x1,y1), (x2,y2), (255,255,255), 1)

            # แกน y' (แนวตั้งของ local frame)
            x3 = int(cx + ry*math.sin(theta)); y3 = int(cy - ry*math.cos(theta))
            x4 = int(cx - ry*math.sin(theta)); y4 = int(cy + ry*math.cos(theta))
            cv2.line(frame, (x3,y3), (x4,y4), (255,255,255), 1)

            # ป้ายเวลาตามควอดรันต์ (ใช้จุดกึ่งกลางแต่ละควอดรันต์ใน local frame แล้วหมุนกลับ)
            def local_to_global(xl, yl):
                return (int(cx + xl*math.cos(theta) + yl*math.sin(theta)),
                        int(cy - xl*math.sin(theta) + yl*math.cos(theta)))

            locs = {
                "Q1": local_to_global(+0.5*rx, +0.5*ry),  # ล่างขวา
                "Q2": local_to_global(-0.5*rx, +0.5*ry),  # ล่างซ้าย
                "Q3": local_to_global(-0.5*rx, -0.5*ry),  # บนซ้าย
                "Q4": local_to_global(+0.5*rx, -0.5*ry),  # บนขวา
            }

            for q, (qx, qy) in locs.items():
                if timers and q in timers:
                    txt = f"{timers[q]:.2f}s"
                    (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                    cv2.rectangle(frame, (qx - tw//2 - 6, qy - th - 10), (qx + tw//2 + 6, qy + 6), (50,50,50), -1)
                    cv2.putText(frame, txt, (qx - tw//2, qy), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)

        return cv2.addWeighted(frame, 1.0 - 0.3, overlay, 0.3, 0)
