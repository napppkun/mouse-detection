# scripts/utils/geom.py
import math

def point_in_rotated_rect(px, py, rx, ry, rw, rh, rotation_deg):
    """
    px,py : จุดทดสอบ (พิกเซล)
    rx,ry : มุมซ้ายบนของกล่อง (ก่อนหมุน)
    rw,rh : กว้าง/สูง
    rotation_deg : องศา (clockwise)
    วิธี: แปลงพอยน์ต์ให้เข้า local ของสี่เหลี่ยม แล้วหมุนกลับ -theta รอบ center
    จากนั้นเช็ค in AABB ปกติ
    """
    if px is None or py is None:
        return False

    cx = rx + rw / 2.0
    cy = ry + rh / 2.0

    # vector from center
    dx = px - cx
    dy = py - cy

    theta = -math.radians(rotation_deg or 0)  # หมุนกลับ
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)

    # rotate point into rect's axis-aligned frame
    lx = dx * cos_t - dy * sin_t
    ly = dx * sin_t + dy * cos_t

    # AABB test in local frame
    half_w = rw / 2.0
    half_h = rh / 2.0
    return (-half_w <= lx <= half_w) and (-half_h <= ly <= half_h)
