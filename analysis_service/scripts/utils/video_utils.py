# scripts/utils/video_utils.py
import cv2
import os

def _force_mp4_path(path: str) -> str:
    base, _ = os.path.splitext(path)
    return base + ".mp4"

def _try_open_writer(path, fps, size, codecs=("mp4v", "avc1", "H264")):
    for c in codecs:
        fourcc = cv2.VideoWriter_fourcc(*c)
        w = cv2.VideoWriter(path, fourcc, fps, size)
        if w.isOpened():
            return w, c
    return None, None

def read_video(video_path):
    """Read all frames from video file"""
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Cannot open video file: {video_path}")
        return []
    
    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
    
    cap.release()
    print(f"Loaded {len(frames)} frames from {video_path}")
    return frames

def save_video(output_video_frames, output_video_path, fps=30):
    """Save frames as video file"""
    if not output_video_frames:
        print("No frames to save")
        return False
    
    try:
        output_video_path = _force_mp4_path(output_video_path)
        height, width, _ = output_video_frames[0].shape
        writer, used = _try_open_writer(output_video_path, fps, (width, height))

        if not writer:
            print(f"Error: Cannot create MP4 writer for {output_video_path} (tried mp4v/avc1/H264)")
            return False
        
        for frame in output_video_frames:
            writer.write(frame)

        writer.release()
        print(f"Video saved: {output_video_path}")
        return True
        
    except Exception as e:
        print(f"Error saving video: {e}")
        return False