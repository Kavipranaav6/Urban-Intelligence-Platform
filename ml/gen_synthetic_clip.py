"""
gen_synthetic_clip.py
Generates a synthetic rash-driving clip with a rendered Indian license plate.

Design:
  W=1280, H=720, FPS=10, N_FRAMES=40
  Car: 240x140px, dark-navy, track_id=7
  Plate: "KA05MN2024" at 150x40px embedded in lower-center of car
         (rendered at 2x resolution then downsampled for quality)
         Positioned at 68% of car height from top (fully within localizer ROI)

Trajectory:
  Phase 0  frames 0–9   slow rightward drift (-4px/frame) + 1px/frame down
  Phase 1  frames 10+   sharp cut-in LEFT: -85px/frame cx, +2px/frame cy

Trigger pre-calculation (traj[0] → traj[-1], measuring from frame 0):
  Frame 13  lateral_rate = (4*9 + 85*3)/1280/1.3 = 291/1664 = 0.175  NOT yet
  Frame 14  lateral_rate = (36 + 85*4)/1280/1.4 = 376/1792 = 0.210 > 0.18 ✓
            speed_px_sec = sqrt(376^2 + 17^2)/1.4 ≈ 268 > 120 ✓
  DESIGNED TRIGGER: frame 14 (t=1.4s) via is_aggressive_cut

Plate variation:
  Frames 0–9  : clean
  Frames 10–14: horizontal motion-blur (kernel 7x1) simulating camera smear
  Frames 15–24: Gaussian noise std=10 + subtle brightness shift
  Frames 25–39: clean again
"""

import cv2
import numpy as np
import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUT_PATH = os.path.join(PROJECT_ROOT, "test_rash_synthetic.mp4")
PLATE_TEXT = "KA05MN2024"

W, H, FPS, N = 1280, 720, 10, 40
CAR_W, CAR_H = 240, 140        # car bbox dimensions in pixels

# Starting cx, cy of car centre
CX0, CY0 = 960.0, 280.0

# Phase boundary
SLOW_FRAMES = 9           # frames 0..8 slow drift (9 frames, index 0-8)
# Frame 9 is the last slow frame; cut-in starts at frame 10


def car_cx_cy(fi: int):
    if fi <= SLOW_FRAMES:
        cx = CX0 - fi * 4.0
        cy = CY0 + fi * 1.0
    else:
        cx = (CX0 - SLOW_FRAMES * 4.0) - (fi - SLOW_FRAMES) * 85.0
        cy = (CY0 + SLOW_FRAMES * 1.0) + (fi - SLOW_FRAMES) * 2.0
    return cx, cy


def render_plate(text: str, out_w=130, out_h=37) -> np.ndarray:
    """Renders a white Indian-style plate with black text at 2× res then downsamples."""
    scale2x_w, scale2x_h = out_w * 2, out_h * 2
    img = np.full((scale2x_h, scale2x_w, 3), 252, dtype=np.uint8)  # near-white bg

    # Black border
    cv2.rectangle(img, (0, 0), (scale2x_w-1, scale2x_h-1), (10, 10, 10), 3)

    # Blue strip at very top (HSRP style)
    cv2.rectangle(img, (0, 0), (scale2x_w-1, 16), (30, 60, 180), -1)

    # Text
    font = cv2.FONT_HERSHEY_DUPLEX
    font_scale = 1.05
    thickness = 2
    tw, th = cv2.getTextSize(text, font, font_scale, thickness)[0]
    tx = max(4, (scale2x_w - tw) // 2)
    ty = scale2x_h - 10
    cv2.putText(img, text, (tx, ty), font, font_scale, (5, 5, 5), thickness, cv2.LINE_AA)

    # Downsample
    plate = cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_AREA)
    return plate


def apply_variation(plate: np.ndarray, fi: int, rng: np.random.Generator) -> np.ndarray:
    """Applies per-frame variation: motion blur (10–14) or noise (15–24)."""
    out = plate.copy()
    if 10 <= fi <= 14:
        # Horizontal motion blur: simulates camera smear during cut-in
        k = 7
        kernel = np.ones((1, k), np.float32) / k
        out = cv2.filter2D(out, -1, kernel)
    elif 15 <= fi <= 24:
        # Gaussian noise + subtle brightness variation
        noise = rng.normal(0, 10, out.shape).astype(np.int16)
        bright = int(rng.uniform(-12, 12))
        out = np.clip(out.astype(np.int16) + noise + bright, 0, 255).astype(np.uint8)
    return out


def draw_frame(fi: int, cx: float, cy: float, plate_img: np.ndarray) -> np.ndarray:
    """Draws one frame: road background + car body + plate."""
    frame = np.zeros((H, W, 3), dtype=np.uint8)

    # Road: dark grey
    frame[:] = (35, 35, 35)

    # Sky gradient at top 25%
    sky_h = H // 4
    for row in range(sky_h):
        t = row / sky_h
        c = int(30 + t * 20)
        frame[row, :] = (c + 5, c + 10, c + 20)

    # Horizon line
    cv2.line(frame, (0, sky_h), (W, sky_h), (55, 55, 60), 2)

    # Lane markings (white dashed)
    for lx in [W//4, W//2, 3*W//4]:
        for y in range(sky_h, H, 60):
            cv2.line(frame, (lx, y), (lx, min(H, y + 30)), (200, 200, 200), 2)

    # Road shoulders
    cv2.line(frame, (40, sky_h), (40, H), (220, 220, 100), 3)
    cv2.line(frame, (W-40, sky_h), (W-40, H), (220, 220, 100), 3)

    # Car bounding box coords
    vx1 = int(cx - CAR_W / 2)
    vy1 = int(cy - CAR_H / 2)
    vx2 = vx1 + CAR_W
    vy2 = vy1 + CAR_H

    # Car body (dark navy)
    cv2.rectangle(frame, (vx1, vy1), (vx2, vy2), (40, 30, 100), -1)

    # Roof (slightly lighter, upper 30%)
    roof_h = int(CAR_H * 0.30)
    roof_inset = 20
    cv2.rectangle(frame, (vx1 + roof_inset, vy1), (vx2 - roof_inset, vy1 + roof_h), (60, 50, 130), -1)

    # Rear window (dark teal)
    win_margin = 30
    win_h = int(CAR_H * 0.22)
    cv2.rectangle(frame,
                  (vx1 + win_margin, vy1 + roof_h),
                  (vx2 - win_margin, vy1 + roof_h + win_h),
                  (20, 60, 80), -1)

    # Tail lights (bright red, lower corners)
    tl_h = int(CAR_H * 0.25)
    tl_w = 18
    tl_y = vy2 - tl_h
    # Left
    cv2.rectangle(frame, (vx1, tl_y), (vx1 + tl_w, vy2), (30, 20, 200), -1)
    # Right
    cv2.rectangle(frame, (vx2 - tl_w, tl_y), (vx2, vy2), (30, 20, 200), -1)

    # Plate: embed at lower-center (82% down the vehicle height)
    ph, pw = plate_img.shape[:2]
    px1 = int(cx - pw / 2)
    py1 = int(vy1 + CAR_H * 0.68)  # 68% down -- plate fully within localizer ROI
    px2 = px1 + pw
    py2 = py1 + ph

    # Clamp to frame
    if 0 <= px1 and px2 <= W and 0 <= py1 and py2 <= H:
        frame[py1:py2, px1:px2] = plate_img

    # Car outline
    cv2.rectangle(frame, (vx1, vy1), (vx2, vy2), (80, 65, 160), 2)

    return frame


def generate_clip(out_path: str):
    rng = np.random.default_rng(42)
    plate_base = render_plate(PLATE_TEXT, out_w=150, out_h=40)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

    for fi in range(N):
        cx, cy = car_cx_cy(fi)
        plate_frame = apply_variation(plate_base.copy(), fi, rng)
        frame = draw_frame(fi, cx, cy, plate_frame)
        writer.write(frame)

    writer.release()
    print(f"[GEN] Wrote {N} frames -> {out_path}")


if __name__ == "__main__":
    generate_clip(OUT_PATH)
