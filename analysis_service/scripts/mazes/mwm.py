# scripts/mazes/mwm.py
from typing import Dict, List, Tuple
from .base_maze import BaseMaze, MazeConfig

class MWM(BaseMaze):
    """Minimal concrete maze for MWM; zones are injected via BaseMaze.set_regions_from_web()."""
    def __init__(self):
        super().__init__(MazeConfig(maze_type="mwm", zones=[], center_zone=None))

    def setup_roi_zones(self) -> Dict[str, List[Tuple[int, int]]]:
        # Not used; regions come from set_regions_from_web()
        return {}

    def get_zone_names(self) -> List[str]:
        return list(self.zones.keys())

    def validate_setup(self) -> bool:
        # Allow empty zones during bootstrap; BaseMaze.set_regions_from_web() will validate again.
        if not self.zones:
            return True
        return super().validate_setup()
