"""
analytics.py - Stage 2 analytics helpers for UrbanSense AI.

Responsibilities:
  - Load ROI and threshold configuration from config.yaml (with built-in defaults).
  - Determine whether a detected bbox centre lies inside the ROI.
  - Compute active vehicle counts (total + per-class) for a single frame.
  - Maintain per-track_id position histories (deque) for relative motion.
  - Calculate relative pixel displacement (NOT vehicle speed; camera is moving).
  - Classify traffic density: LOW / MEDIUM / HIGH.
  - Classify congestion level: LOW / MEDIUM / HIGH (prototype heuristic).

LIMITATIONS:
  - Density and congestion thresholds are prototype values that require
    calibration against real traffic data for each deployment site.
  - Relative motion is measured in pixels between consecutive tracker
    observations. Because the bus camera is moving, this does NOT represent
    actual vehicle speed and must NOT be labelled as such.
"""

import os
import math
from collections import deque
from typing import Dict, List, Tuple, Any, Optional

# ---------------------------------------------------------------------------
# Configuration loading
# ---------------------------------------------------------------------------

_DEFAULT_CFG = {
    "roi": {"x_min": 0.10, "y_min": 0.35, "x_max": 0.90, "y_max": 0.95},
    "density": {"low_max": 5, "medium_max": 12},
    "congestion": {"low_max": 5, "medium_max": 12},
}

_cfg_cache = None


def load_config():
    """Load config.yaml from the same directory as this file.
    Falls back to built-in defaults if the file is missing or malformed.
    """
    global _cfg_cache
    if _cfg_cache is not None:
        return _cfg_cache

    import copy
    cfg = copy.deepcopy(_DEFAULT_CFG)
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
    try:
        import yaml
        with open(config_path, "r") as fh:
            loaded = yaml.safe_load(fh) or {}
        # Merge Stage 2 keys with defaults as before
        for key in ("roi", "density", "congestion"):
            if key in loaded and isinstance(loaded[key], dict):
                cfg[key] = loaded[key]
        # Pass through ALL other yaml sections (hazard, trajectory, etc.) verbatim
        for key, val in loaded.items():
            if key not in cfg:
                cfg[key] = val
        print(f"[Analytics] Loaded config from {config_path}")
    except FileNotFoundError:
        print(f"[Analytics] config.yaml not found; using defaults.")
    except Exception as exc:
        print(f"[Analytics] Failed to parse config.yaml ({exc}); using defaults.")

    _cfg_cache = cfg
    return cfg



# ---------------------------------------------------------------------------
# ROI helpers
# ---------------------------------------------------------------------------

def is_inside_roi(bbox_pixels, frame_width, frame_height, roi):
    """Return True if the centre of bbox_pixels lies within the normalised ROI.

    bbox_pixels: [xmin, ymin, xmax, ymax] in pixel coordinates.
    roi keys: x_min, y_min, x_max, y_max  (normalised 0..1).
    """
    if not frame_width or not frame_height:
        return True
    cx = ((bbox_pixels[0] + bbox_pixels[2]) / 2.0) / frame_width
    cy = ((bbox_pixels[1] + bbox_pixels[3]) / 2.0) / frame_height
    return (roi["x_min"] <= cx <= roi["x_max"] and
            roi["y_min"] <= cy <= roi["y_max"])


def bbox_centre(bbox_pixels):
    """Return (cx, cy) in pixels for a bbox."""
    return ((bbox_pixels[0] + bbox_pixels[2]) / 2.0,
            (bbox_pixels[1] + bbox_pixels[3]) / 2.0)


# ---------------------------------------------------------------------------
# Active / unique counting
# ---------------------------------------------------------------------------

def compute_frame_active_counts(detections, frame_width, frame_height, roi):
    """Count vehicles whose bbox centre lies inside the ROI for a single frame.

    Returns:
        active_total  - total active vehicles inside ROI.
        active_by_cls - per-class active counts inside ROI.
    """
    active_by_cls = {}
    active_total = 0
    for det in detections:
        if not is_inside_roi(det["bboxPixels"], frame_width, frame_height, roi):
            continue
        cls = det["class"]
        active_by_cls[cls] = active_by_cls.get(cls, 0) + 1
        active_total += 1
    return active_total, active_by_cls


def update_unique_ids(unique_set, detections):
    """Add valid track IDs (>= 0) from detections into unique_set."""
    for det in detections:
        tid = det.get("track_id", -1)
        if tid >= 0:
            unique_set.add(tid)


# ---------------------------------------------------------------------------
# Density & congestion
# ---------------------------------------------------------------------------

def classify_density(active_in_roi, thresholds):
    """Classify traffic density.
    Thresholds are prototype values requiring real-world calibration.
    """
    if active_in_roi <= thresholds.get("low_max", 5):
        return "LOW"
    elif active_in_roi <= thresholds.get("medium_max", 12):
        return "MEDIUM"
    else:
        return "HIGH"


def classify_congestion(active_in_roi, density, avg_motion_score, thresholds):
    """Prototype heuristic congestion estimation.

    Primary signal  : active_in_roi / density label.
    Supporting signal: avg_motion_score (lower pixel motion -> more congestion).

    IMPORTANT: avg_motion_score is pixel displacement between consecutive
    tracker observations. It is NOT vehicle speed in km/h. The camera is
    moving and there is no camera-motion compensation or calibration.
    """
    level = density  # start from density (LOW/MEDIUM/HIGH)
    if density == "MEDIUM" and avg_motion_score < 2.0:
        level = "HIGH"
    elif density == "LOW" and active_in_roi >= thresholds.get("low_max", 5) and avg_motion_score < 1.5:
        level = "MEDIUM"
    return level


# ---------------------------------------------------------------------------
# Relative motion (trajectory history)
# ---------------------------------------------------------------------------

def update_motion_history(track_histories, track_id, centre, maxlen=30):
    """Append centre to track_id history and return the latest displacement.

    Displacement is Euclidean pixel distance between the two most recent
    positions. Returns 0.0 if no prior position exists.

    This is relative pixel motion, NOT vehicle speed (km/h).
    """
    if track_id not in track_histories:
        track_histories[track_id] = deque(maxlen=maxlen)
    hist = track_histories[track_id]
    displacement = 0.0
    if len(hist) >= 1:
        prev = hist[-1]
        dx = centre[0] - prev[0]
        dy = centre[1] - prev[1]
        displacement = math.sqrt(dx * dx + dy * dy)
    hist.append(centre)
    return displacement


def average_motion_score(track_histories):
    """Compute average displacement across all active tracks.
    Returns 0.0 if no tracks have enough history.
    """
    scores = []
    for hist in track_histories.values():
        if len(hist) >= 2:
            hist_list = list(hist)
            dx = hist_list[-1][0] - hist_list[-2][0]
            dy = hist_list[-1][1] - hist_list[-2][1]
            scores.append(math.sqrt(dx * dx + dy * dy))
    return round(sum(scores) / len(scores), 2) if scores else 0.0


# ---------------------------------------------------------------------------
# Track summary builder
# ---------------------------------------------------------------------------

def build_track_summaries(all_detections_by_frame, track_histories, track_class_map):
    """Build per-track summary for the API response.

    Each entry: track_id, class, trajectory [{frameIndex, centerX, centerY}],
    relativeMotionScore (average pixel displacement - NOT speed).
    """
    track_trajectories = {}
    for frame_idx, dets in all_detections_by_frame.items():
        for det in dets:
            tid = det.get("track_id", -1)
            if tid < 0:
                continue
            cx, cy = bbox_centre(det["bboxPixels"])
            track_trajectories.setdefault(tid, []).append({
                "frameIndex": frame_idx,
                "centerX": round(cx, 1),
                "centerY": round(cy, 1),
            })

    summaries = []
    for tid, traj in track_trajectories.items():
        hist = track_histories.get(tid)
        motion_score = 0.0
        if hist and len(hist) >= 2:
            hist_list = list(hist)
            displacements = []
            for j in range(1, len(hist_list)):
                dx = hist_list[j][0] - hist_list[j - 1][0]
                dy = hist_list[j][1] - hist_list[j - 1][1]
                displacements.append(math.sqrt(dx * dx + dy * dy))
            motion_score = round(sum(displacements) / len(displacements), 2)

        summaries.append({
            "track_id": tid,
            "class": track_class_map.get(tid, "unknown"),
            "trajectory": traj,
            # NOTE: relativeMotionScore is pixel displacement between tracker
            # observations. NOT vehicle speed. Camera is moving.
            "relativeMotionScore": motion_score,
        })

    return summaries
