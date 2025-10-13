"""
Y-Maze Implementation
Handles Y-Maze specific zone definitions, tracking, and spontaneous alternation analysis
"""
# scripts/mazes/ymaze.py
from typing import Dict, List, Tuple, Optional
import numpy as np
from .base_maze import BaseMaze, ZoneConfig, MazeConfig


class YMaze(BaseMaze):
    """
    Y-Maze implementation for spontaneous alternation testing.
    
    Y-Maze consists of:
    - 3 Arms (A, B, C) arranged in Y-shape
    - 1 Center zone (intersection of all arms)
    
    Key metrics:
    - Spontaneous alternation percentage
    - Total arm entries
    - Sequence of arm visits
    - Entries per arm
    """
    
    def __init__(self, config: Optional[MazeConfig] = None):
        """
        Initialize Y-Maze with default or custom configuration.
        
        Args:
            config: Custom MazeConfig, if None uses default Y-Maze setup
        """
        if config is None:
            config = self._create_default_config()
            
        super().__init__(config)
        
        # Y-Maze specific tracking
        self.arm_sequence: List[str] = []  # Sequence of arm entries
        self.arm_entries: Dict[str, int] = {"A": 0, "B": 0, "C": 0}
        self.total_arm_entries: int = 0
        self.alternation_count: int = 0
        self.possible_alternations: int = 0
    
    def arm_label(self, name: Optional[str]) -> str:
        # map arm_1/2/3 -> arm_A/B/C ตามลำดับเพื่อให้สอดคล้อง UI
        if not name: return "outside"
        if name in ("A", "B", "C"):
            return f"arm_{name}"
        # legacy:
        if name.startswith("arm_1"): return "arm_A"
        if name.startswith("arm_2"): return "arm_B"
        if name.startswith("arm_3"): return "arm_C"
        if name == "center": return "center"
        return "outside"
        
    def _create_default_config(self) -> MazeConfig:
        """Create default Y-Maze configuration with standard zones"""
        zones = [
            # Arm A (typically top-right)
            ZoneConfig(
                name="A",
                color=(255, 0, 0),  # Red
                roi_points=[(400, 100), (500, 50), (550, 150), (450, 200)],
                is_entry_zone=True
            ),
            
            # Arm B (typically top-left)  
            ZoneConfig(
                name="B",
                color=(0, 255, 0),  # Green
                roi_points=[(100, 50), (200, 100), (150, 200), (50, 150)],
                is_entry_zone=True
            ),
            
            # Arm C (typically bottom)
            ZoneConfig(
                name="C", 
                color=(0, 0, 255),  # Blue
                roi_points=[(250, 350), (350, 350), (350, 450), (250, 450)],
                is_entry_zone=True
            ),
        ]
        
        return MazeConfig(
            maze_type="Y-Maze",
            zones=zones,
            center_zone=None,
            frame_width=640,
            frame_height=480
        )
    
    def setup_roi_zones(self) -> Dict[str, List[Tuple[int, int]]]:
        """
        Setup ROI zones for Y-Maze.
        
        Returns:
            Dictionary mapping zone names to their ROI polygon points
        """
        roi_zones = {}
        for zone_name, zone_config in self.zones.items():
            roi_zones[zone_name] = zone_config.roi_points
        return roi_zones
    
    def get_zone_names(self) -> List[str]:
        """Get all Y-Maze zone names"""
        return ["A", "B", "C"]
    
    def get_arm_names(self) -> List[str]:
        """Get only arm names (excluding center)"""
        return ["A", "B", "C"]
    
    def is_arm(self, zone_name: str) -> bool:
        """Check if a zone is an arm"""
        return zone_name in ["A", "B", "C"]
    
    def is_center(self, zone_name: str) -> bool:
        """Check if a zone is the center"""
        return zone_name == "center"
    
    def update_position(self, centroid: Tuple[int, int], timestamp: float):
        """
        Update position and track Y-Maze specific metrics.
        
        Args:
            centroid: Current rat centroid position
            timestamp: Current timestamp in seconds
        """
        previous_zone = self.current_zone
        super().update_position(centroid, timestamp)

        # If entered a new arm, record the entry even though it's the same zone
        if self.current_zone in ("A", "B", "C") and self.current_zone != previous_zone:
            self._record_arm_entry(self.current_zone, timestamp)

    def _record_arm_entry(self, arm_name: str, timestamp: float):
        """
        Record an entry into an arm and update alternation analysis.
        
        Args:
            arm_name: Name of the arm entered (A, B, or C)
            timestamp: Timestamp of entry
        """
        # Record the entry
        self.arm_sequence.append(arm_name)
        self.arm_entries[arm_name] += 1
        self.total_arm_entries += 1
        
        # Update alternation analysis
        self._update_alternation_analysis()
    
    def _update_alternation_analysis(self):
        """Update spontaneous alternation analysis (SLIDING WINDOW)."""
        n = len(self.arm_sequence)
        # สองรายการแรกเป็น None (ตอน export จะทำเป็น "")
        self.alternation_results = [None] * n

        self.alternation_count = 0
        self.possible_alternations = max(0, n - 2)

        for i in range(2, n):
            a, b, c = self.arm_sequence[i-2], self.arm_sequence[i-1], self.arm_sequence[i]
            is_alt = int(len({a, b, c}) == 3)
            self.alternation_results[i] = is_alt
            self.alternation_count += is_alt
    
    def _is_alternation(self, triplet: List[str]) -> bool:
        """
        Check if a triplet of arm visits represents alternation.
        Alternation = all three arms are different.
        
        Args:
            triplet: List of 3 consecutive arm visits
            
        Returns:
            True if triplet represents alternation
        """
        if len(triplet) != 3:
            return False
        
        # All three arms must be different for spontaneous alternation
        return len(set(triplet)) == 3
    
    def calculate_alternation_percentage(self) -> float:
        """
        Calculate spontaneous alternation percentage.
        
        Returns:
            Alternation percentage (0-100)
        """
        if self.possible_alternations <= 0:
            return 0.0
        return (self.alternation_count / self.possible_alternations) * 100.0
    
    def is_valid_transition(self, from_zone: Optional[str], to_zone: Optional[str]) -> bool:
        """
        Check if zone transition is valid for Y-Maze.
        Valid transitions: arms <-> center, but not arm <-> arm directly.
        
        Args:
            from_zone: Previous zone
            to_zone: Current zone
            
        Returns:
            True if transition is valid
        """
        if from_zone is None or to_zone is None:
            return True
        
        # Same zone is always valid
        if from_zone == to_zone:
            return True
        
        # Transitions involving center are always valid
        if from_zone == "center" or to_zone == "center":
            return True
        
        # Direct arm-to-arm transitions should be rare
        # (might indicate tracking errors or very quick movement through center)
        if self.is_arm(from_zone) and self.is_arm(to_zone):
            return False  # Mark as invalid for debugging
        
        return True
    
    def get_arm_statistics(self) -> Dict[str, Dict]:
        """
        Get detailed statistics for each arm.
        
        Returns:
            Dictionary with statistics for each arm
        """
        arm_stats = {}
        
        for arm in self.get_arm_names():
            percentage = 0.0
            if self.total_arm_entries > 0:
                percentage = (self.arm_entries[arm] / self.total_arm_entries) * 100
            
            arm_stats[arm] = {
                "entries": self.arm_entries[arm],
                "percentage": percentage
            }
        
        return arm_stats
    
    def get_alternation_analysis(self) -> Dict:
        """
        Get detailed alternation analysis.
        
        Returns:
            Dictionary with alternation analysis results
        """
        return {
            "arm_sequence": self.arm_sequence.copy(),
            "total_entries": self.total_arm_entries,
            "alternation_count": self.alternation_count,
            "possible_alternations": self.possible_alternations,  # = total_entries-2
            "alternation_percentage": self.calculate_alternation_percentage(),
            "entries_per_arm": self.arm_entries.copy()
        }
    
    def get_sequence_patterns(self) -> Dict[str, int]:
        """
        Analyze sequence patterns in arm visits.
        
        Returns:
            Dictionary with pattern counts
        """
        patterns = {
            "alternations": 0,
            "returns": 0,  # Immediate returns to same arm
            "perseverations": 0  # Staying in same area repeatedly
        }
        
        if len(self.arm_sequence) < 2:
            return patterns
        
        # Count different patterns
        for i in range(1, len(self.arm_sequence)):
            current = self.arm_sequence[i]
            previous = self.arm_sequence[i-1]
            
            if current == previous:
                patterns["returns"] += 1
            
            # Check for alternation in triplets
            if i >= 2:
                triplet = self.arm_sequence[i-2:i+1]
                if self._is_alternation(triplet):
                    patterns["alternations"] += 1
        
        # Count perseverations (3+ consecutive visits to same arm)
        current_run = 1
        for i in range(1, len(self.arm_sequence)):
            if self.arm_sequence[i] == self.arm_sequence[i-1]:
                current_run += 1
            else:
                if current_run >= 3:
                    patterns["perseverations"] += current_run - 2
                current_run = 1
        
        # Check final run
        if current_run >= 3:
            patterns["perseverations"] += current_run - 2
        
        return patterns
    
    def validate_arm_sequence(self) -> List[str]:
        """
        Validate and clean the arm sequence, removing any invalid entries.
        
        Returns:
            Cleaned arm sequence
        """
        valid_arms = self.get_arm_names()
        cleaned_sequence = [arm for arm in self.arm_sequence if arm in valid_arms]
        return cleaned_sequence
    
    def reset_tracking(self):
        """Reset all Y-Maze tracking data"""
        super().reset_tracking()
        self.arm_sequence.clear()
        self.arm_entries = {"A": 0, "B": 0, "C": 0}
        self.total_arm_entries = 0
        self.alternation_count = 0
        self.possible_alternations = 0
    
    def export_ymaze_data(self) -> Dict:
        """
        Export all Y-Maze specific data for analysis.
        
        Returns:
            Dictionary containing all Y-Maze tracking data
        """
        return {
            "maze_type": "Y-Maze",
            "zone_names": self.get_zone_names(),
            "arm_names": self.get_arm_names(),
            "position_history": self.position_history,
            "arm_sequence": self.arm_sequence,
            "arm_entries": self.arm_entries,
            "total_arm_entries": self.total_arm_entries,
            "alternation_analysis": self.get_alternation_analysis(),
            "arm_statistics": self.get_arm_statistics(),
            "sequence_patterns": self.get_sequence_patterns(),
            "current_zone": self.current_zone,
            "previous_zone": self.previous_zone
        }
    
    @classmethod
    def create_custom_ymaze(cls,
                           arm_coords: Dict[str, List[Tuple[int, int]]],
                           center_coords: List[Tuple[int, int]],
                           frame_size: Tuple[int, int] = (640, 480)) -> 'YMaze':
        """
        Create Y-Maze with custom coordinates.
        
        Args:
            arm_coords: Dictionary mapping arm names (A, B, C) to their polygon coordinates
            center_coords: Polygon coordinates for center zone
            frame_size: (width, height) of video frames
            
        Returns:
            YMaze instance with custom configuration
        """
        zones = []
        colors = {"A": (255, 0, 0), "B": (0, 255, 0), "C": (0, 0, 255)}
        
        # Add arms
        for arm_name in ["A", "B", "C"]:
            if arm_name in arm_coords:
                zones.append(ZoneConfig(
                    name=arm_name,
                    color=colors[arm_name],
                    roi_points=arm_coords[arm_name],
                    is_entry_zone=True
                ))
        
        # Add center
        zones.append(ZoneConfig(
            name="center",
            color=(255, 255, 0),
            roi_points=center_coords,
            is_entry_zone=False
        ))
        
        config = MazeConfig(
            maze_type="Y-Maze",
            zones=zones,
            center_zone="center",
            frame_width=frame_size[0],
            frame_height=frame_size[1]
        )
        
        return cls(config)