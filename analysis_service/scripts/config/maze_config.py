"""
Maze Configuration Management Module
Handles configuration settings for different behavioral maze types
"""
# scripts/config/maze_config.py
import json, os, logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class EPMConfig:
    """Configuration for Elevated Plus Maze"""
    # Physical dimensions (in cm)
    arm_length: float = 50.0
    arm_width: float = 10.0
    center_size: float = 10.0
    wall_height: float = 30.0
    maze_height: float = 50.0  # Height above ground
    
    # Arm definitions
    open_arms: List[str] = None
    closed_arms: List[str] = None
    
    # Analysis parameters
    anxiety_threshold: float = 25.0  # Percentage threshold for high anxiety
    velocity_threshold: float = 2.0  # cm/s for freezing detection
    
    # Experimental parameters
    default_duration: float = 300.0  # seconds (5 minutes)
    fps: float = 30.0
    
    # Zone colors for visualization
    open_arm_color: str = "lightcoral"
    closed_arm_color: str = "lightblue"
    center_color: str = "lightgreen"
    
    def __post_init__(self):
        if self.open_arms is None:
            self.open_arms = ["north", "south"]
        if self.closed_arms is None:
            self.closed_arms = ["east", "west"]
    
    def validate(self) -> bool:
        """Validate configuration parameters"""
        errors = []
        
        if self.arm_length <= 0:
            errors.append("Arm length must be positive")
        if self.arm_width <= 0:
            errors.append("Arm width must be positive")
        if self.center_size <= 0:
            errors.append("Center size must be positive")
        if self.wall_height < 0:
            errors.append("Wall height cannot be negative")
        if self.default_duration <= 0:
            errors.append("Duration must be positive")
        if self.fps <= 0:
            errors.append("FPS must be positive")
        if not (0 <= self.anxiety_threshold <= 100):
            errors.append("Anxiety threshold must be between 0 and 100")
        
        if errors:
            logger.error(f"EPM Configuration validation failed: {errors}")
            return False
        return True

@dataclass
class YMazeConfig:
    """Configuration for Y-Maze"""
    # Physical dimensions (in cm)
    arm_length: float = 40.0
    arm_width: float = 12.0
    center_radius: float = 8.0
    arm_angle: float = 120.0  # Degrees between arms
    
    # Arm definitions
    arms: List[str] = None
    arm_positions: Dict[str, Dict[str, Any]] = None
    
    # Analysis parameters
    alternation_chance_level: float = 22.2  # Theoretical chance level for 3 arms
    velocity_threshold: float = 2.0  # cm/s for freezing detection
    memory_threshold: float = 60.0  # Percentage threshold for good memory
    
    # Experimental parameters
    default_duration: float = 480.0  # seconds (8 minutes)
    fps: float = 30.0
    
    def __post_init__(self):
        if self.arms is None:
            self.arms = ["A", "B", "C"]
        if self.arm_positions is None:
            self.arm_positions = {
                "A": {"angle": 90, "color": "red", "name": "Top"},
                "B": {"angle": 210, "color": "blue", "name": "Bottom Left"},
                "C": {"angle": 330, "color": "green", "name": "Bottom Right"}
            }
    
    def validate(self) -> bool:
        """Validate configuration parameters"""
        errors = []
        
        if self.arm_length <= 0:
            errors.append("Arm length must be positive")
        if self.arm_width <= 0:
            errors.append("Arm width must be positive")
        if self.center_radius <= 0:
            errors.append("Center radius must be positive")
        if not (90 <= self.arm_angle <= 150):
            errors.append("Arm angle should be between 90 and 150 degrees")
        if self.default_duration <= 0:
            errors.append("Duration must be positive")
        if self.fps <= 0:
            errors.append("FPS must be positive")
        if not (0 <= self.memory_threshold <= 100):
            errors.append("Memory threshold must be between 0 and 100")
        
        if len(self.arms) != 3:
            errors.append("Y-maze must have exactly 3 arms")
        
        if errors:
            logger.error(f"Y-Maze Configuration validation failed: {errors}")
            return False
        return True

@dataclass
class MWMConfig:
    """Configuration for Morris Water Maze (analysis level)"""
    default_duration: float = 60.0
    fps: float = 30.0
    target_quadrant: str = "Q1"              # 'Q1'..'Q4'
    quadrants: List[str] = None              # ["Q1","Q2","Q3","Q4"]

    def __post_init__(self):
        if self.quadrants is None:
            self.quadrants = ["Q1", "Q2", "Q3", "Q4"]
        self.target_quadrant = str(self.target_quadrant).upper()

    def validate(self) -> bool:
        errs = []
        if self.default_duration <= 0:
            errs.append("default_duration must be positive")
        if self.fps <= 0:
            errs.append("fps must be positive")
        if self.target_quadrant not in {"Q1","Q2","Q3","Q4"}:
            errs.append("target_quadrant must be Q1..Q4")
        if errs:
            logger.error(f"MWM configuration validation failed: {errs}")
            return False
        return True

@dataclass
class ExperimentConfig:
    """General experiment configuration"""
    experiment_id: str = ""
    subject_id: str = ""
    researcher: str = ""
    date: str = ""
    notes: str = ""
    
    # Video/tracking parameters
    video_file: Optional[str] = None
    tracking_fps: float = 30.0
    pixel_to_cm_ratio: float = 1.0  # pixels per cm
    
    # Analysis parameters
    smoothing_window: int = 3  # frames for position smoothing
    min_bout_duration: float = 1.0  # seconds
    
    # Export settings
    export_format: str = "excel"  # csv, excel, json
    include_plots: bool = True
    plot_format: str = "png"  # png, pdf, svg

class MazeConfigManager:
    """Manager for maze configurations"""
    
    def __init__(self, config_dir: str = "configs"):
        """
        Initialize configuration manager
        
        Args:
            config_dir: Directory to store configuration files
        """
        self.config_dir = config_dir
        self.ensure_config_directory()
        
        # Default configurations
        self._default_epm = EPMConfig()
        self._default_ymaze = YMazeConfig()
        self._default_mwm = MWMConfig()
        self._default_experiment = ExperimentConfig()
    
    def ensure_config_directory(self):
        """Create config directory if it doesn't exist"""
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir)
            logger.info(f"Created config directory: {self.config_dir}")
    
    def save_epm_config(self, config: EPMConfig, name: str = "default") -> str:
        """Save EPM configuration to file"""
        if not config.validate():
            raise ValueError("Invalid EPM configuration")
        
        filepath = os.path.join(self.config_dir, f"epm_config_{name}.json")
        with open(filepath, 'w') as f:
            json.dump(asdict(config), f, indent=2)
        
        logger.info(f"EPM configuration saved: {filepath}")
        return filepath
    
    def load_epm_config(self, name: str = "default") -> EPMConfig:
        """Load EPM configuration from file"""
        filepath = os.path.join(self.config_dir, f"epm_config_{name}.json")
        
        if not os.path.exists(filepath):
            logger.warning(f"EPM config file not found: {filepath}, using default")
            return self._default_epm
        
        try:
            with open(filepath, 'r') as f:
                config_dict = json.load(f)
            config = EPMConfig(**config_dict)
            
            if not config.validate():
                logger.error(f"Invalid EPM config in {filepath}, using default")
                return self._default_epm
            
            logger.info(f"EPM configuration loaded: {filepath}")
            return config
            
        except Exception as e:
            logger.error(f"Error loading EPM config {filepath}: {e}")
            return self._default_epm
    
    def save_ymaze_config(self, config: YMazeConfig, name: str = "default") -> str:
        """Save Y-maze configuration to file"""
        if not config.validate():
            raise ValueError("Invalid Y-maze configuration")
        
        filepath = os.path.join(self.config_dir, f"ymaze_config_{name}.json")
        with open(filepath, 'w') as f:
            json.dump(asdict(config), f, indent=2)
        
        logger.info(f"Y-maze configuration saved: {filepath}")
        return filepath
    
    def load_ymaze_config(self, name: str = "default") -> YMazeConfig:
        """Load Y-maze configuration from file"""
        filepath = os.path.join(self.config_dir, f"ymaze_config_{name}.json")
        
        if not os.path.exists(filepath):
            logger.warning(f"Y-maze config file not found: {filepath}, using default")
            return self._default_ymaze
        
        try:
            with open(filepath, 'r') as f:
                config_dict = json.load(f)
            config = YMazeConfig(**config_dict)
            
            if not config.validate():
                logger.error(f"Invalid Y-maze config in {filepath}, using default")
                return self._default_ymaze
            
            logger.info(f"Y-maze configuration loaded: {filepath}")
            return config
            
        except Exception as e:
            logger.error(f"Error loading Y-maze config {filepath}: {e}")
            return self._default_ymaze
        
    def save_mwm_config(self, config: MWMConfig, name: str = "default") -> str:
        if not config.validate():
            raise ValueError("Invalid MWM configuration")
        filepath = os.path.join(self.config_dir, f"mwm_config_{name}.json")
        with open(filepath, 'w') as f:
            json.dump(asdict(config), f, indent=2)
        logger.info(f"MWM configuration saved: {filepath}")
        return filepath

    def load_mwm_config(self, name: str = "default") -> MWMConfig:
        filepath = os.path.join(self.config_dir, f"mwm_config_{name}.json")
        if not os.path.exists(filepath):
            logger.warning(f"MWM config file not found: {filepath}, using default")
            return self._default_mwm
        try:
            with open(filepath, 'r') as f:
                d = json.load(f)
            cfg = MWMConfig(**d)
            if not cfg.validate():
                logger.error(f"Invalid MWM config in {filepath}, using default")
                return self._default_mwm
            return cfg
        except Exception as e:
            logger.error(f"Error loading MWM config {filepath}: {e}")
            return self._default_mwm
    
    def save_experiment_config(self, config: ExperimentConfig, name: str = "default") -> str:
        """Save experiment configuration to file"""
        filepath = os.path.join(self.config_dir, f"experiment_config_{name}.json")
        with open(filepath, 'w') as f:
            json.dump(asdict(config), f, indent=2)
        
        logger.info(f"Experiment configuration saved: {filepath}")
        return filepath
    
    def load_experiment_config(self, name: str = "default") -> ExperimentConfig:
        """Load experiment configuration from file"""
        filepath = os.path.join(self.config_dir, f"experiment_config_{name}.json")
        
        if not os.path.exists(filepath):
            logger.warning(f"Experiment config file not found: {filepath}, using default")
            return self._default_experiment
        
        try:
            with open(filepath, 'r') as f:
                config_dict = json.load(f)
            config = ExperimentConfig(**config_dict)
            
            logger.info(f"Experiment configuration loaded: {filepath}")
            return config
            
        except Exception as e:
            logger.error(f"Error loading experiment config {filepath}: {e}")
            return self._default_experiment
    
    def create_config_from_web_form(self, form_data: Dict[str, Any], maze_type: str) -> Dict[str, Any]:
        if maze_type.lower() == 'epm':
            return self._create_epm_from_form(form_data)
        elif maze_type.lower() == 'ymaze':
            return self._create_ymaze_from_form(form_data)
        elif maze_type.lower() == 'mwm':
            return self._create_mwm_from_form(form_data)
        else:
            raise ValueError(f"Unsupported maze type: {maze_type}")
    
    def _create_epm_from_form(self, form_data: Dict[str, Any]) -> EPMConfig:
        """Create EPM config from web form data"""
        config = EPMConfig()
        
        # Physical dimensions
        if 'arm_length' in form_data:
            config.arm_length = float(form_data['arm_length'])
        if 'arm_width' in form_data:
            config.arm_width = float(form_data['arm_width'])
        if 'center_size' in form_data:
            config.center_size = float(form_data['center_size'])
        if 'wall_height' in form_data:
            config.wall_height = float(form_data['wall_height'])
        if 'maze_height' in form_data:
            config.maze_height = float(form_data['maze_height'])
        
        # Experimental parameters
        if 'duration' in form_data:
            config.default_duration = float(form_data['duration'])
        if 'fps' in form_data:
            config.fps = float(form_data['fps'])
        
        # Analysis parameters
        if 'anxiety_threshold' in form_data:
            config.anxiety_threshold = float(form_data['anxiety_threshold'])
        if 'velocity_threshold' in form_data:
            config.velocity_threshold = float(form_data['velocity_threshold'])
        
        # Arm definitions
        if 'open_arms' in form_data:
            config.open_arms = form_data['open_arms']
        if 'closed_arms' in form_data:
            config.closed_arms = form_data['closed_arms']
        
        # Colors
        if 'open_arm_color' in form_data:
            config.open_arm_color = form_data['open_arm_color']
        if 'closed_arm_color' in form_data:
            config.closed_arm_color = form_data['closed_arm_color']
        if 'center_color' in form_data:
            config.center_color = form_data['center_color']
        
        return config
    
    def _create_ymaze_from_form(self, form_data: Dict[str, Any]) -> YMazeConfig:
        """Create Y-maze config from web form data"""
        config = YMazeConfig()
        
        # Physical dimensions
        if 'arm_length' in form_data:
            config.arm_length = float(form_data['arm_length'])
        if 'arm_width' in form_data:
            config.arm_width = float(form_data['arm_width'])
        if 'center_radius' in form_data:
            config.center_radius = float(form_data['center_radius'])
        if 'arm_angle' in form_data:
            config.arm_angle = float(form_data['arm_angle'])
        
        # Experimental parameters
        if 'duration' in form_data:
            config.default_duration = float(form_data['duration'])
        if 'fps' in form_data:
            config.fps = float(form_data['fps'])
        
        # Analysis parameters
        if 'memory_threshold' in form_data:
            config.memory_threshold = float(form_data['memory_threshold'])
        if 'velocity_threshold' in form_data:
            config.velocity_threshold = float(form_data['velocity_threshold'])
        
        # Arm definitions
        if 'arms' in form_data:
            config.arms = form_data['arms']
        
        # Arm positions and colors
        if 'arm_positions' in form_data:
            config.arm_positions = form_data['arm_positions']
        else:
            # Update individual arm properties if provided
            for arm in config.arms:
                if f'arm_{arm}_angle' in form_data:
                    config.arm_positions[arm]['angle'] = float(form_data[f'arm_{arm}_angle'])
                if f'arm_{arm}_color' in form_data:
                    config.arm_positions[arm]['color'] = form_data[f'arm_{arm}_color']
                if f'arm_{arm}_name' in form_data:
                    config.arm_positions[arm]['name'] = form_data[f'arm_{arm}_name']
        
        return config
    
    def _create_mwm_from_form(self, form_data: Dict[str, Any]) -> MWMConfig:
        cfg = MWMConfig()
        if 'duration' in form_data:
            cfg.default_duration = float(form_data['duration'])
        if 'fps' in form_data:
            cfg.fps = float(form_data['fps'])
        if 'target_quadrant' in form_data:
            cfg.target_quadrant = str(form_data['target_quadrant']).upper()
        return cfg
    
    def get_config_templates(self) -> Dict[str, Dict]:
        """Get configuration templates for web forms"""
        return {
            'epm': {
                'physical_dimensions': {
                    'arm_length': {'type': 'float', 'default': 50.0, 'min': 10.0, 'max': 100.0, 'unit': 'cm'},
                    'arm_width': {'type': 'float', 'default': 10.0, 'min': 5.0, 'max': 20.0, 'unit': 'cm'},
                    'center_size': {'type': 'float', 'default': 10.0, 'min': 5.0, 'max': 20.0, 'unit': 'cm'},
                    'wall_height': {'type': 'float', 'default': 30.0, 'min': 0.0, 'max': 50.0, 'unit': 'cm'},
                    'maze_height': {'type': 'float', 'default': 50.0, 'min': 30.0, 'max': 100.0, 'unit': 'cm'}
                },
                'experimental': {
                    'duration': {'type': 'float', 'default': 300.0, 'min': 60.0, 'max': 1800.0, 'unit': 'seconds'},
                    'fps': {'type': 'float', 'default': 30.0, 'min': 10.0, 'max': 120.0, 'unit': 'fps'}
                },
                'analysis': {
                    'anxiety_threshold': {'type': 'float', 'default': 25.0, 'min': 0.0, 'max': 100.0, 'unit': '%'},
                    'velocity_threshold': {'type': 'float', 'default': 2.0, 'min': 0.1, 'max': 10.0, 'unit': 'cm/s'}
                },
                'visualization': {
                    'open_arm_color': {'type': 'color', 'default': 'lightcoral'},
                    'closed_arm_color': {'type': 'color', 'default': 'lightblue'},
                    'center_color': {'type': 'color', 'default': 'lightgreen'}
                }
            },
            'ymaze': {
                'physical_dimensions': {
                    'arm_length': {'type': 'float', 'default': 40.0, 'min': 20.0, 'max': 80.0, 'unit': 'cm'},
                    'arm_width': {'type': 'float', 'default': 12.0, 'min': 6.0, 'max': 20.0, 'unit': 'cm'},
                    'center_radius': {'type': 'float', 'default': 8.0, 'min': 4.0, 'max': 15.0, 'unit': 'cm'},
                    'arm_angle': {'type': 'float', 'default': 120.0, 'min': 90.0, 'max': 150.0, 'unit': 'degrees'}
                },
                'experimental': {
                    'duration': {'type': 'float', 'default': 480.0, 'min': 120.0, 'max': 1800.0, 'unit': 'seconds'},
                    'fps': {'type': 'float', 'default': 30.0, 'min': 10.0, 'max': 120.0, 'unit': 'fps'}
                },
                'analysis': {
                    'memory_threshold': {'type': 'float', 'default': 60.0, 'min': 0.0, 'max': 100.0, 'unit': '%'},
                    'velocity_threshold': {'type': 'float', 'default': 2.0, 'min': 0.1, 'max': 10.0, 'unit': 'cm/s'}
                },
                'arms': {
                    'arm_A_angle': {'type': 'float', 'default': 90.0, 'min': 0.0, 'max': 360.0, 'unit': 'degrees'},
                    'arm_B_angle': {'type': 'float', 'default': 210.0, 'min': 0.0, 'max': 360.0, 'unit': 'degrees'},
                    'arm_C_angle': {'type': 'float', 'default': 330.0, 'min': 0.0, 'max': 360.0, 'unit': 'degrees'},
                    'arm_A_color': {'type': 'color', 'default': 'red'},
                    'arm_B_color': {'type': 'color', 'default': 'blue'},
                    'arm_C_color': {'type': 'color', 'default': 'green'}
                }
            },
            'mwm': {
                'experimental': {
                    'duration': {'type': 'float', 'default': 60.0, 'min': 10.0, 'max': 600.0, 'unit': 'seconds'},
                    'fps': {'type': 'float', 'default': 30.0, 'min': 10.0, 'max': 120.0, 'unit': 'fps'},
                    'target_quadrant': {'type': 'choice', 'default': 'Q1', 'choices': ['Q1','Q2','Q3','Q4']}
                }
            }
        }
    
    def list_saved_configs(self, maze_type: Optional[str] = None) -> Dict[str, List[str]]:
        """List all saved configuration files"""
        configs = {'epm': [], 'ymaze': [], 'mwm': [], 'experiment': []}
        
        if not os.path.exists(self.config_dir):
            return configs
        
        for filename in os.listdir(self.config_dir):
            if filename.endswith('.json'):
                if filename.startswith('epm_config_'):
                    config_name = filename.replace('epm_config_', '').replace('.json', '')
                    configs['epm'].append(config_name)
                elif filename.startswith('ymaze_config_'):
                    config_name = filename.replace('ymaze_config_', '').replace('.json', '')
                    configs['ymaze'].append(config_name)
                elif filename.startswith('mwm_config_'):
                    config_name = filename.replace('mwm_config_', '').replace('.json', '')
                    configs['mwm'].append(config_name)
                elif filename.startswith('experiment_config_'):
                    config_name = filename.replace('experiment_config_', '').replace('.json', '')
                    configs['experiment'].append(config_name)
        
        if maze_type:
            return {maze_type: configs.get(maze_type, [])}
        
        return configs
    
    def delete_config(self, maze_type: str, name: str) -> bool:
        """Delete a saved configuration"""
        filepath = os.path.join(self.config_dir, f"{maze_type}_config_{name}.json")
        
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Deleted configuration: {filepath}")
            return True
        else:
            logger.warning(f"Configuration file not found: {filepath}")
            return False
    
    def export_config(self, maze_type: str, name: str, export_path: str) -> bool:
        """Export configuration to specified path"""
        source_path = os.path.join(self.config_dir, f"{maze_type}_config_{name}.json")
        
        if not os.path.exists(source_path):
            logger.error(f"Configuration file not found: {source_path}")
            return False
        
        try:
            import shutil
            shutil.copy2(source_path, export_path)
            logger.info(f"Configuration exported to: {export_path}")
            return True
        except Exception as e:
            logger.error(f"Error exporting configuration: {e}")
            return False
    
    def import_config(self, import_path: str, maze_type: str, name: str) -> bool:
        """Import configuration from specified path"""
        if not os.path.exists(import_path):
            logger.error(f"Import file not found: {import_path}")
            return False
        
        try:
            # Validate the configuration
            with open(import_path, 'r') as f:
                config_dict = json.load(f)
            
            if maze_type == 'epm':
                config = EPMConfig(**config_dict)
                if config.validate():
                    self.save_epm_config(config, name)
                else:
                    return False
            elif maze_type == 'ymaze':
                config = YMazeConfig(**config_dict)
                if config.validate():
                    self.save_ymaze_config(config, name)
                else:
                    return False
            elif maze_type == 'mwm':
                config = MWMConfig(**config_dict)
                if config.validate():
                    self.save_mwm_config(config, name)
                else:
                    return False
            else:
                logger.error(f"Unsupported maze type for import: {maze_type}")
                return False
            
            logger.info(f"Configuration imported successfully: {name}")
            return True
            
        except Exception as e:
            logger.error(f"Error importing configuration: {e}")
            return False