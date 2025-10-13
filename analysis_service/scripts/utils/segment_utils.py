import numpy as np

def get_position_from_segment(segment):
    """
    รองรับทั้ง:
    - np.ndarray mask
    - {"mask": np.ndarray, "bbox": [x1,y1,x2,y2], ...}
    - {"bbox": [...]} อย่างเดียว
    """
    if segment is None:
        return None

    # dict from tracker.detect_frame
    if isinstance(segment, dict):
        if segment.get("mask") is not None:
            m = segment["mask"]
            y_coords, x_coords = np.where(m > 0)
            if len(x_coords) and len(y_coords):
                return (int(np.mean(x_coords)), int(np.mean(y_coords)))
        if segment.get("bbox") is not None:
            x1, y1, x2, y2 = segment["bbox"]
            return (int((x1 + x2)/2), int((y1 + y2)/2))

    # raw mask
    if hasattr(segment, "shape"):
        y_coords, x_coords = np.where(segment > 0)
        if len(x_coords) and len(y_coords):
            return (int(np.mean(x_coords)), int(np.mean(y_coords)))

    return None
