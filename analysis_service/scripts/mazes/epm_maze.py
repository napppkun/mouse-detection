"""
Elevated Plus Maze (EPM) Implementation
Handles EPM-specific zone definitions, tracking, and analysis
"""

from os import name
from typing import Dict, List, Tuple, Optional
import numpy as np
from .base_maze import BaseMaze, ZoneConfig, MazeConfig


class EPMMaze(BaseMaze):
    """
    Elevated Plus Maze implementation.
    
    EPM consists of:
    - 2 Open Arms (anxiety-inducing, well-lit)
    - 2 Closed Arms (safe, enclosed)
    
    Key metrics:
    - Time spent in open vs closed arms (anxiety measure)
    - Total distance traveled
    """
    
    def __init__(self, config: Optional[MazeConfig] = None):
        """
        Initialize EPM with default or custom configuration.
        
        Args:
            config: Custom MazeConfig, if None uses default EPM setup
        """
        if config is None:
            config = self._create_default_config()
        
        super().__init__(config)
        
        # EPM-specific tracking
        self.open_arm_entries: int = 0
        self.closed_arm_entries: int = 0
        self.total_entries: int = 0
        self.zone_entry_history: List[Tuple[str, float]] = []  # Track all entries with timestamps

    def zone_type(self, name: Optional[str]) -> str:
        if not name: return "outside"
        if name.startswith("open_arm"): return "open_arm"
        if name.startswith("closed_arm"): return "closed_arm"
        if name == "center": return "center"
        return "outside"
        
    def _create_default_config(self) -> MazeConfig:
        """Create default EPM configuration with standard zones"""
        zones = [
            # Open Arms (typically horizontal)
            ZoneConfig(
                name="open_arm_left",
                color=(0, 255, 0),  # Green
                roi_points=[(50, 200), (200, 200), (200, 300), (50, 300)],
                is_entry_zone=True
            ),
            ZoneConfig(
                name="open_arm_right", 
                color=(0, 255, 0),  # Green
                roi_points=[(400, 200), (550, 200), (550, 300), (400, 300)],
                is_entry_zone=True
            ),
            
            # Closed Arms (typically vertical)
            ZoneConfig(
                name="closed_arm_top",
                color=(0, 0, 255),  # Red
                roi_points=[(250, 50), (350, 50), (350, 200), (250, 200)],
                is_entry_zone=True
            ),
            ZoneConfig(
                name="closed_arm_bottom",
                color=(0, 0, 255),  # Red
                roi_points=[(250, 300), (350, 300), (350, 450), (250, 450)],
                is_entry_zone=True
            ),
        ]
        
        return MazeConfig(
            maze_type="EPM",
            zones=zones,
            center_zone=None,
            frame_width=640,
            frame_height=480
        )
    
    def setup_roi_zones(self) -> Dict[str, List[Tuple[int, int]]]:
        """
        Setup ROI zones for EPM.
        
        Returns:
            Dictionary mapping zone names to their ROI polygon points
        """
        roi_zones = {}
        for zone_name, zone_config in self.zones.items():
            roi_zones[zone_name] = zone_config.roi_points
        return roi_zones
    
    def get_zone_names(self) -> List[str]:
        """Get all EPM zone names"""
        return ["open_arm_left", "open_arm_right", "closed_arm_top", "closed_arm_bottom"]
    
    def is_open_arm(self, zone_name: str) -> bool:
        """Check if a zone is an open arm"""
        return zone_name in ["open_arm_left", "open_arm_right"]
    
    def is_closed_arm(self, zone_name: str) -> bool:
        """Check if a zone is a closed arm"""
        return zone_name in ["closed_arm_top", "closed_arm_bottom"]
    
    def is_center(self, zone_name: str) -> bool:
        """Check if a zone is the center"""
        return zone_name == "center"
    
    def update_position(self, centroid: Tuple[int, int], timestamp: float):
        """
        Update position and track EPM-specific metrics.
        
        Args:
            centroid: Current rat centroid position
            timestamp: Current timestamp in seconds
        """
        previous_zone = self.current_zone
        super().update_position(centroid, timestamp)
        
        # If entered a new zone, record the entry
        if self.current_zone in ("A", "B", "C") and self.current_zone != previous_zone:
            self._record_arm_entry(self.current_zone, timestamp)
   
    def _record_entry(self, zone_name: str, timestamp: float):
        """Record an entry into an arm"""
        self.zone_entry_history.append((zone_name, timestamp))
        self.total_entries += 1
        
        if self.is_open_arm(zone_name):
            self.open_arm_entries += 1
        elif self.is_closed_arm(zone_name):
            self.closed_arm_entries += 1
    
    def is_valid_transition(self, from_zone: Optional[str], to_zone: Optional[str]) -> bool:
        """
        Check if zone transition is valid for EPM.
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
        
        # Direct arm-to-arm transitions are unusual but possible
        # (rat might jump or move quickly through center)
        # We'll allow them but they might indicate tracking errors
        return True
    
    def calculate_time_in_zones(self, total_duration: float) -> Dict[str, float]:
        """
        Calculate time spent in each zone.
        
        Args:
            total_duration: Total experiment duration in seconds
            
        Returns:
            Dictionary with time spent in each zone category
        """
        zone_times = {
            "open_arms": 0.0,
            "closed_arms": 0.0, 
            "center": 0.0,
            "unknown": 0.0
        }
        
        if not self.position_history:
            return zone_times
        
        # Calculate time in each zone
        for i, (zone_name, timestamp) in enumerate(self.position_history):
            if i < len(self.position_history) - 1:
                # Duration is until next zone change
                duration = self.position_history[i + 1][1] - timestamp
            else:
                # Last entry, duration is until end of experiment
                duration = total_duration - timestamp
            
            if self.is_open_arm(zone_name):
                zone_times["open_arms"] += duration
            elif self.is_closed_arm(zone_name):
                zone_times["closed_arms"] += duration
            elif self.is_center(zone_name):
                zone_times["center"] += duration
            else:
                zone_times["unknown"] += duration
        
        return zone_times
    
    def calculate_anxiety_metrics(self, total_duration: float) -> Dict[str, float]:
        """
        Calculate anxiety-related metrics.
        
        Args:
            total_duration: Total experiment duration in seconds
            
        Returns:
            Dictionary containing anxiety metrics
        """
        zone_times = self.calculate_time_in_zones(total_duration)
        total_arm_time = zone_times["open_arms"] + zone_times["closed_arms"]
        
        metrics = {
            "open_arm_percentage": 0.0,
            "closed_arm_percentage": 0.0,
            "open_arm_entries": self.open_arm_entries,
            "closed_arm_entries": self.closed_arm_entries,
            "total_entries": self.total_entries,
            "anxiety_index": 0.0  # Lower values indicate higher anxiety
        }
        
        if total_arm_time > 0:
            metrics["open_arm_percentage"] = (zone_times["open_arms"] / total_arm_time) * 100
            metrics["closed_arm_percentage"] = (zone_times["closed_arms"] / total_arm_time) * 100
        
        # Anxiety index combines time and entries in open arms
        # Higher values = less anxious behavior
        if self.total_entries > 0:
            open_entry_ratio = self.open_arm_entries / self.total_entries
            time_ratio = zone_times["open_arms"] / max(total_duration, 1.0)
            metrics["anxiety_index"] = (open_entry_ratio + time_ratio) / 2.0 * 100
        
        return metrics
    
    def get_detailed_zone_stats(self, total_duration: float) -> Dict[str, Dict]:
        """
        Get detailed statistics for each individual zone.
        
        Args:
            total_duration: Total experiment duration in seconds
            
        Returns:
            Dictionary with detailed stats for each zone
        """
        zone_stats = {}
        
        # Initialize stats for each zone
        for zone_name in self.get_zone_names():
            zone_stats[zone_name] = {
                "time_spent": 0.0,
                "entries": 0,
                "percentage": 0.0
            }
        
        # Calculate time spent in each specific zone
        for i, (zone_name, timestamp) in enumerate(self.position_history):
            if zone_name not in zone_stats:
                continue
                
            if i < len(self.position_history) - 1:
                duration = self.position_history[i + 1][1] - timestamp
            else:
                duration = total_duration - timestamp
            
            zone_stats[zone_name]["time_spent"] += duration
        
        # Calculate entries for each zone
        for zone_name, timestamp in self.zone_entry_history:
            if zone_name in zone_stats:
                zone_stats[zone_name]["entries"] += 1
        
        # Calculate percentages
        for zone_name in zone_stats:
            if total_duration > 0:
                zone_stats[zone_name]["percentage"] = (
                    zone_stats[zone_name]["time_spent"] / total_duration
                ) * 100
        
        return zone_stats
    
    def reset_tracking(self):
        """Reset all EPM tracking data"""
        super().reset_tracking()
        self.open_arm_entries = 0
        self.closed_arm_entries = 0
        self.total_entries = 0
        self.zone_entry_history.clear()
    
    def export_epm_data(self) -> Dict:
        """
        Export all EPM-specific data for analysis.
        
        Returns:
            Dictionary containing all EPM tracking data
        """
        return {
            "maze_type": "EPM",
            "zone_names": self.get_zone_names(),
            "position_history": self.position_history,
            "entry_history": self.zone_entry_history,
            "open_arm_entries": self.open_arm_entries,
            "closed_arm_entries": self.closed_arm_entries,
            "total_entries": self.total_entries,
            "current_zone": self.current_zone,
            "previous_zone": self.previous_zone
        }
    
    @classmethod
    def create_custom_epm(cls, 
                         open_arm_coords: List[List[Tuple[int, int]]],
                         closed_arm_coords: List[List[Tuple[int, int]]],
                         center_coords: List[Tuple[int, int]],
                         frame_size: Tuple[int, int] = (640, 480)) -> 'EPMMaze':
        """
        Create EPM with custom coordinates.
        
        Args:
            open_arm_coords: List of polygon coordinates for each open arm
            closed_arm_coords: List of polygon coordinates for each closed arm  
            center_coords: Polygon coordinates for center zone
            frame_size: (width, height) of video frames
            
        Returns:
            EPMMaze instance with custom configuration
        """
        zones = []
        
        # Add open arms
        for i, coords in enumerate(open_arm_coords):
            zones.append(ZoneConfig(
                name=f"open_arm_{i+1}",
                color=(0, 255, 0),
                roi_points=coords,
                is_entry_zone=True
            ))
        
        # Add closed arms
        for i, coords in enumerate(closed_arm_coords):
            zones.append(ZoneConfig(
                name=f"closed_arm_{i+1}",
                color=(0, 0, 255), 
                roi_points=coords,
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
            maze_type="EPM",
            zones=zones,
            center_zone="center",
            frame_width=frame_size[0],
            frame_height=frame_size[1]
        )
        
        return cls(config)