"""
hazard_detector.py - Stage 3: Road & Infrastructure Hazard Detection

UrbanSense-AI: Mobile Urban Intelligence Platform Using Public Transport Fleet
Supports detection and reporting of:
  1. potholes
  2. waterlogging
  3. road damage / cracks
  4. damaged or missing traffic signs

Architecture & Safety Notes:
  - Vehicle tracking and hazard detection are strictly SEPARATE concerns.
    Hazards are NEVER fed into ByteTrack's vehicle tracker.
  - Transparent prototype severity system: based on normalized bounding box area
    and confidence. This is an image-space prioritization metric, NOT an official
    civil engineering pothole depth, structural rating, or safety certification.
  - Temporal/spatial deduplication prevents redundant incident tickets when the
    same physical hazard is seen across consecutive video frames.
  - If a trained hazard model is not found at the configured path, the detector
    enters a graceful fallback state without crashing or breaking vehicle tracking.
"""

import os
import math
import cv2
import base64
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

from ml.inference.analytics import load_config


# ---------------------------------------------------------------------------
# Centralized Hazard Class Normalization
# ---------------------------------------------------------------------------
# Maps model-specific class names to standardized UrbanSense hazard categories:
# 'pothole', 'waterlogging', 'road_damage', 'traffic_sign'
HAZARD_CLASS_MAPPINGS: Dict[str, str] = {
    # Potholes
    "pothole": "pothole",
    "potholes": "pothole",
    "pit": "pothole",
    "manhole": "pothole",
    "open_manhole": "pothole",
    "d40": "pothole",

    # Waterlogging
    "waterlogging": "waterlogging",
    "water": "waterlogging",
    "flooded_road": "waterlogging",
    "flood": "waterlogging",
    "puddle": "waterlogging",
    "water_logging": "waterlogging",
    "standing_water": "waterlogging",
    "drainage": "waterlogging",          # ianmutai DRAINAGE -> blocked drain = waterlogging risk

    # Road Damage / Cracks
    "road_damage": "road_damage",
    "crack": "road_damage",
    "damaged_road": "road_damage",
    "road_crack": "road_damage",
    "alligator_crack": "road_damage",
    "transverse_crack": "road_damage",
    "longitudinal_crack": "road_damage",
    "other_corruption": "road_damage",
    "corruption": "road_damage",
    "d00": "road_damage",
    "d10": "road_damage",
    "d20": "road_damage",
    "rutting": "road_damage",
    "pavement_crack": "road_damage",
    "surface_damage": "road_damage",
    "patch": "road_damage",
    "unpaved_road": "road_damage",
    "construction": "road_damage",
    "speed_bump": "road_damage",        # ianmutai SPEED_BUMP
    "road_marking": "road_damage",      # ianmutai ROAD_MARKING (faded/missing)

    # Traffic Signs
    "traffic_sign": "traffic_sign",
    "road_sign": "traffic_sign",
    "sign": "traffic_sign",
    "damaged_sign": "traffic_sign",
    "missing_sign": "traffic_sign",
    "sign_damage": "traffic_sign",
    "street_sign": "traffic_sign",
    "bent_sign": "traffic_sign",
    "traffic_light": "traffic_sign",        # ianmutai TRAFFIC_LIGHT (damaged/missing signal)
    "guardrail": "traffic_sign",            # ianmutai GUARDRAIL (safety infrastructure)
    "pedestrian_crossing": "traffic_sign",  # ianmutai PEDESTRIAN_CROSSING (faded markings)
}

# Color styling for hazard visual overlays
HAZARD_COLOR_MAP: Dict[str, Tuple[int, int, int]] = {
    "pothole": (0, 140, 255),        # Deep orange/amber (BGR)
    "waterlogging": (255, 180, 0),     # Cyan/Sky blue (BGR)
    "road_damage": (50, 50, 255),      # Red (BGR)
    "traffic_sign": (180, 0, 220),     # Purple/Magenta (BGR)
    "unknown": (150, 150, 150),        # Gray (BGR)
}


def normalize_hazard_class(raw_class: str) -> str:
    """
    Normalizes arbitrary hazard label strings into standardized categories.
    Unknown classes remain 'unknown' rather than being incorrectly coerced.
    """
    if not raw_class or not isinstance(raw_class, str):
        return "unknown"
    clean = raw_class.strip().lower().replace("-", "_").replace(" ", "_")
    return HAZARD_CLASS_MAPPINGS.get(clean, "unknown")


# ---------------------------------------------------------------------------
# Hazard ROI Filtering
# ---------------------------------------------------------------------------
def is_inside_hazard_roi(
    bbox: List[float],
    frame_width: int,
    frame_height: int,
    roi: Optional[Dict[str, float]] = None
) -> bool:
    """
    Evaluates whether the hazard's bounding box center falls within the hazard ROI.
    ROI is configurable per bus because camera mounting height/angle varies.
    """
    if roi is None:
        roi = {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00}

    cx = (bbox[0] + bbox[2]) / 2.0
    cy = (bbox[1] + bbox[3]) / 2.0
    norm_x = cx / max(1, frame_width)
    norm_y = cy / max(1, frame_height)

    return (
        roi.get("x_min", 0.05) <= norm_x <= roi.get("x_max", 0.95) and
        roi.get("y_min", 0.35) <= norm_y <= roi.get("y_max", 1.00)
    )


# ---------------------------------------------------------------------------
# Hazard Severity Prioritization
# ---------------------------------------------------------------------------
def calculate_hazard_severity(
    bbox: List[float],
    confidence: float,
    frame_width: int,
    frame_height: int,
    severity_cfg: Optional[Dict[str, float]] = None
) -> str:
    """
    Deterministic prototype severity classification based on normalized bounding box area
    and detection confidence.

    SAFETY & INTEGRITY NOTE:
      This is a prototype prioritization score for maintenance dispatch, NOT an official
      civil-engineering pothole depth, pavement condition index (PCI), or safety certificate.
    """
    if severity_cfg is None:
        severity_cfg = {
            "high_area": 0.08,
            "medium_area": 0.025,
            "high_confidence": 0.85,
            "medium_confidence": 0.60
        }

    # Normalize confidence to 0.0 .. 1.0
    conf_norm = confidence / 100.0 if confidence > 1.0 else confidence

    # Compute normalized bounding box area
    w = max(0.0, float(bbox[2]) - float(bbox[0]))
    h = max(0.0, float(bbox[3]) - float(bbox[1]))
    bbox_area = w * h
    frame_area = max(1.0, float(frame_width * frame_height))
    normalized_area = bbox_area / frame_area

    high_area = severity_cfg.get("high_area", 0.08)
    med_area = severity_cfg.get("medium_area", 0.025)
    high_conf = severity_cfg.get("high_confidence", 0.85)
    med_conf = severity_cfg.get("medium_confidence", 0.60)

    # High severity: large defect area or high-confidence detection
    if normalized_area >= high_area or conf_norm >= high_conf:
        return "HIGH"
    # Medium severity: moderate defect area or medium-confidence detection
    elif normalized_area >= med_area or conf_norm >= med_conf:
        return "MEDIUM"
    else:
        return "LOW"


# ---------------------------------------------------------------------------
# Evidence Frame Generation
# ---------------------------------------------------------------------------
def render_hazard_evidence(
    frame: np.ndarray,
    bbox: List[float],
    hazard_type: str,
    confidence: float,
    severity: str,
    timestamp_str: str,
    incident_id: str
) -> str:
    """
    Draws a stylized detection overlay on the frame (bounding box, label, severity pill)
    and returns a base64 JPEG data URL for frontend evidence preview.
    """
    if frame is None or frame.size == 0:
        return ""

    annotated = frame.copy()
    xmin, ymin, xmax, ymax = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
    h_color = HAZARD_COLOR_MAP.get(hazard_type, (0, 140, 255))

    # Bounding box
    cv2.rectangle(annotated, (xmin, ymin), (xmax, ymax), h_color, 2)

    # Label text & tag
    conf_pct = int(confidence * 100) if confidence <= 1.0 else int(confidence)
    label_text = f"{hazard_type.replace('_', ' ').upper()} {conf_pct}% [{severity}]"

    (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    tag_y = max(ymin - 6, th + 6)
    cv2.rectangle(annotated, (xmin, tag_y - th - 4), (xmin + tw + 8, tag_y + 4), h_color, -1)
    cv2.putText(annotated, label_text, (xmin + 4, tag_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

    # Top-right timestamp / ID stamp
    info_stamp = f"{incident_id} @ {timestamp_str}"
    (sw, sh), _ = cv2.getTextSize(info_stamp, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    cv2.rectangle(annotated, (annotated.shape[1] - sw - 16, 8), (annotated.shape[1] - 4, 16 + sh + 4), (20, 20, 20), -1)
    cv2.putText(annotated, info_stamp, (annotated.shape[1] - sw - 10, 12 + sh),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 1, cv2.LINE_AA)

    _, jpg = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    return "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")


# ---------------------------------------------------------------------------
# Temporal & Spatial Deduplication Tracker
# ---------------------------------------------------------------------------
class HazardIncidentTracker:
    """
    Manages active hazard incident records and deduplicates detections over time and space.
    Ensures that a defect visible for multiple consecutive frames produces a single coherent
    incident record with the best evidence image and highest confidence score.
    """

    def __init__(
        self,
        time_window_seconds: float = 5.0,
        distance_pixels: float = 100.0,
        bus_id: str = "BUS-103"
    ):
        self.time_window = time_window_seconds
        self.distance_threshold = distance_pixels
        self.bus_id = bus_id
        self.incidents: List[Dict[str, Any]] = []
        self._counter = 0

    def add_or_update_detection(
        self,
        hazard_class: str,
        confidence: float,
        severity: str,
        timestamp_sec: float,
        frame_index: int,
        bbox: List[float],
        frame: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """
        Ingests a hazard detection. If it matches an active incident within the time
        and distance window, updates it. Otherwise, registers a new incident.
        """
        cx = (bbox[0] + bbox[2]) / 2.0
        cy = (bbox[1] + bbox[3]) / 2.0
        conf_pct = round(confidence * 100, 1) if confidence <= 1.0 else round(confidence, 1)

        # Look for a matching existing incident
        matched_incident: Optional[Dict[str, Any]] = None
        for inc in reversed(self.incidents):
            # Same hazard category
            if inc["type"] != hazard_class:
                continue
            # Within time window
            if abs(timestamp_sec - inc["timestamp"]) > self.time_window:
                continue
            # Within spatial distance threshold
            dist = math.hypot(cx - inc["center"][0], cy - inc["center"][1])
            if dist <= self.distance_threshold:
                matched_incident = inc
                break

        mins = int(timestamp_sec // 60)
        secs = int(timestamp_sec % 60)
        timestamp_str = f"{mins:02d}:{secs:02d}"

        if matched_incident is not None:
            # Update existing incident with latest timestamp / frame
            matched_incident["lastSeenTimestamp"] = round(timestamp_sec, 2)
            matched_incident["lastSeenFrameIndex"] = frame_index
            matched_incident["observationCount"] = matched_incident.get("observationCount", 1) + 1

            # If this detection has higher confidence, update peak values and evidence frame
            if conf_pct > matched_incident["confidence"]:
                matched_incident["confidence"] = conf_pct
                matched_incident["bboxPixels"] = [round(b, 1) for b in bbox]
                matched_incident["center"] = [round(cx, 1), round(cy, 1)]

                # Upgrade severity if higher
                sev_order = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
                if sev_order.get(severity, 1) > sev_order.get(matched_incident["severity"], 1):
                    matched_incident["severity"] = severity

                if frame is not None:
                    matched_incident["evidenceFrameDataUrl"] = render_hazard_evidence(
                        frame=frame,
                        bbox=bbox,
                        hazard_type=hazard_class,
                        confidence=conf_pct,
                        severity=matched_incident["severity"],
                        timestamp_str=timestamp_str,
                        incident_id=matched_incident["id"]
                    )
            return matched_incident

        # Otherwise, create a new incident
        self._counter += 1
        incident_id = f"HAZ-{self._counter:04d}"

        evidence_b64 = ""
        if frame is not None:
            evidence_b64 = render_hazard_evidence(
                frame=frame,
                bbox=bbox,
                hazard_type=hazard_class,
                confidence=conf_pct,
                severity=severity,
                timestamp_str=timestamp_str,
                incident_id=incident_id
            )

        new_incident: Dict[str, Any] = {
            "id": incident_id,
            "type": hazard_class,
            "confidence": conf_pct,
            "severity": severity,
            "timestamp": round(timestamp_sec, 2),
            "timestampFormatted": timestamp_str,
            "frameIndex": frame_index,
            "bboxPixels": [round(b, 1) for b in bbox],
            "center": [round(cx, 1), round(cy, 1)],
            "busId": self.bus_id,
            "status": "NEW",  # NEW -> ACKNOWLEDGED -> RESOLVED
            "evidenceFrameDataUrl": evidence_b64,
            # GPS integration placeholder: GPS telemetry will populate this when hardware is connected.
            "location": {
                "latitude": None,
                "longitude": None
            },
            "observationCount": 1,
            "lastSeenTimestamp": round(timestamp_sec, 2),
            "lastSeenFrameIndex": frame_index
        }

        self.incidents.append(new_incident)
        return new_incident

    def get_summary(self) -> Dict[str, Any]:
        """
        Builds the standardized 'hazards' API report block.
        """
        by_type = {"pothole": 0, "waterlogging": 0, "road_damage": 0, "traffic_sign": 0}
        by_sev = {"high": 0, "medium": 0, "low": 0}

        for inc in self.incidents:
            t = inc["type"]
            if t in by_type:
                by_type[t] += 1
            s = inc["severity"].lower()
            if s in by_sev:
                by_sev[s] += 1

        active_count = len([i for i in self.incidents if i.get("status") in ("NEW", "ACKNOWLEDGED")])

        return {
            "totalDetected": len(self.incidents),
            "activeIncidents": active_count,
            "byType": by_type,
            "bySeverity": by_sev,
            "incidents": self.incidents
        }


# ---------------------------------------------------------------------------
# Road Surface Waterlogging & Puddle Detection
# ---------------------------------------------------------------------------
def detect_waterlogging_in_frame(
    frame: np.ndarray,
    roi: Optional[Dict[str, float]] = None,
    severity_cfg: Optional[Dict[str, float]] = None
) -> List[Dict[str, Any]]:
    """
    Computer Vision Road Surface Waterlogging & Puddle Detector.
    Detects standing water, surface ponding, and wet road patches by evaluating
    specular reflection, pavement contrast, and low local texture variance within the road ROI.
    """
    if frame is None or frame.size == 0:
        return []

    if roi is None:
        roi = {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00}

    h, w = frame.shape[:2]
    ymin = max(0, int(h * roi.get("y_min", 0.35)))
    ymax = min(h, int(h * roi.get("y_max", 1.00)))
    xmin = max(0, int(w * roi.get("x_min", 0.05)))
    xmax = min(w, int(w * roi.get("x_max", 0.95)))

    road = frame[ymin:ymax, xmin:xmax]
    if road.size == 0:
        return []

    gray = cv2.cvtColor(road, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 0)

    mean_val, std_val = cv2.meanStdDev(gray)
    road_mean = mean_val[0][0]
    road_std = std_val[0][0]

    # Waterlogged surface candidates:
    # 1. Dark standing water: wet asphalt absorbs light, significantly darker than road average
    dark_thresh = max(20, int(road_mean - 1.25 * road_std))
    _, dark_mask = cv2.threshold(blurred, dark_thresh, 255, cv2.THRESH_BINARY_INV)

    # 2. Specular reflection standing water (mirror sky/headlight reflections): high V, low S
    hsv = cv2.cvtColor(road, cv2.COLOR_BGR2HSV)
    _, s_ch, v_ch = cv2.split(hsv)
    spec_thresh = min(240, int(road_mean + 1.8 * road_std))
    spec_mask = (v_ch > spec_thresh) & (s_ch < 45)
    spec_mask_u8 = spec_mask.astype(np.uint8) * 255

    combined = cv2.bitwise_or(dark_mask, spec_mask_u8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = (xmax - xmin) * (ymax - ymin) * 0.02  # At least 2% of road ROI
    max_area = (xmax - xmin) * (ymax - ymin) * 0.50

    detections = []
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    road_lap_var = max(50.0, float(np.var(lap)))

    for i, c in enumerate(contours):
        area = cv2.contourArea(c)
        if area < min_area or area > max_area:
            continue

        rx, ry, rw, rh = cv2.boundingRect(c)
        aspect = rw / max(1, rh)
        # Avoid vertical road stripes or posts
        if aspect < 0.65 or aspect > 4.5:
            continue

        mask_c = np.zeros(gray.shape, dtype=np.uint8)
        cv2.drawContours(mask_c, [c], -1, 255, -1)
        interior_pixels = lap[mask_c == 255]
        if len(interior_pixels) == 0:
            continue

        interior_lap_var = float(np.var(interior_pixels))
        # Puddles have very smooth water surfaces compared to rough dry pavement
        if interior_lap_var > 0.45 * road_lap_var and interior_lap_var > 220.0:
            continue

        gx1 = xmin + rx
        gy1 = ymin + ry
        gx2 = gx1 + rw
        gy2 = gy1 + rh
        bbox = [float(gx1), float(gy1), float(gx2), float(gy2)]

        # Confidence scaled by contrast and smoothness
        conf_val = min(0.92, max(0.65, 0.62 + (area / min_area) * 0.04))
        severity = calculate_hazard_severity(bbox, conf_val, w, h, severity_cfg)

        cx = (gx1 + gx2) / 2.0
        cy = (gy1 + gy2) / 2.0
        norm_x = gx1 / max(1, w)
        norm_y = gy1 / max(1, h)
        norm_w = rw / max(1, w)
        norm_h = rh / max(1, h)

        detections.append({
            "id": f"hazard-water-{i}",
            "class": "waterlogging",
            "raw_class": "waterlogging",
            "confidence": round(conf_val * 100, 1),
            "bboxPixels": [round(float(b), 1) for b in bbox],
            "center": [round(cx, 1), round(cy, 1)],
            "normalizedBbox": [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
            "severity": severity,
        })

    return detections


def apply_hazard_nms(detections: List[Dict[str, Any]], iou_threshold: float = 0.45) -> List[Dict[str, Any]]:
    """
    Suppresses redundant overlapping bounding boxes from multiple detector models,
    preserving the highest confidence detection for each physical hazard.
    """
    if len(detections) <= 1:
        return detections

    sorted_dets = sorted(detections, key=lambda d: d.get("confidence", 0), reverse=True)
    kept = []

    for det in sorted_dets:
        b1 = det["bboxPixels"]
        overlap = False
        for k in kept:
            b2 = k["bboxPixels"]
            x1 = max(b1[0], b2[0])
            y1 = max(b1[1], b2[1])
            x2 = min(b1[2], b2[2])
            y2 = min(b1[3], b2[3])
            inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
            area1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
            area2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
            union = area1 + area2 - inter
            iou = inter / max(1.0, union)
            if iou > iou_threshold:
                overlap = True
                break
        if not overlap:
            kept.append(det)

    return kept


# ---------------------------------------------------------------------------
# Hazard Detector Engine
# ---------------------------------------------------------------------------
class HazardDetector:
    """
    Stage 3 Road & Infrastructure Hazard Detector.
    Loads and runs YOLO hazard inference independently of the vehicle detection pipeline.
    Supports multi-model detection (dedicated pothole YOLO, road damage YOLO)
    and computer-vision road surface waterlogging detection.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        custom_model: Optional[Any] = None
    ):
        if config is None:
            try:
                config = load_config()
            except Exception:
                config = {}

        self.config = config.get("hazard", {})
        self.roi = self.config.get("roi", {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00})
        self.severity_cfg = self.config.get("severity", {
            "high_area": 0.08,
            "medium_area": 0.025,
            "high_confidence": 0.85,
            "medium_confidence": 0.60
        })
        self.dedup_cfg = self.config.get("deduplication", {
            "time_window_seconds": 5.0,
            "distance_pixels": 100.0
        })
        self.frame_interval = self.config.get("frame_interval", 5)
        self.conf_threshold = self.config.get("conf_threshold", 0.25)

        self.models: List[Any] = []
        self.model = None
        self.is_available = False
        self.device = "cpu"

        # 1. Custom model injected (e.g. for testing / mocking)
        if custom_model is not None:
            self.model = custom_model
            self.models.append(custom_model)
            self.is_available = True
            self.model_path = "custom_model"
            print("[HazardDetector] Initialized with custom model instance.")
            return

        # Resolve paths relative to this file's location so loading works regardless of CWD
        current_dir = os.path.dirname(os.path.abspath(__file__))
        ml_dir = os.path.dirname(current_dir)
        root_dir = os.path.dirname(ml_dir)

        # Explicit model_path provided by caller
        if model_path is not None:
            resolved_explicit = model_path
            if not os.path.exists(resolved_explicit):
                alt_paths = [
                    os.path.join(ml_dir, "models", os.path.basename(model_path)),
                    os.path.join(root_dir, "ml", "models", os.path.basename(model_path)),
                    os.path.join(current_dir, "..", "models", os.path.basename(model_path))
                ]
                for alt in alt_paths:
                    if os.path.exists(alt):
                        resolved_explicit = alt
                        break

            self.model_path = resolved_explicit
            if os.path.exists(resolved_explicit):
                try:
                    import torch
                    from ultralytics import YOLO
                    self.device = "cuda:0" if (hasattr(torch, 'cuda') and torch.cuda.is_available()) else "cpu"
                    loaded = YOLO(resolved_explicit)
                    self.models.append(loaded)
                    self.model = loaded
                    self.is_available = True
                    print(f"[HazardDetector] Loaded model from '{resolved_explicit}' on {self.device}.")
                except Exception as e:
                    print(f"[HazardDetector] Failed to load model at '{resolved_explicit}': {e}")
                    self.is_available = False
            else:
                self.is_available = False
                self.model = None
                print(f"[HazardDetector] Notice: Model not found at '{model_path}'. Fallback mode active.")
            return

        # Default model search: load all available weights (hazard, pothole)
        configured_path = self.config.get("model_path", "ml/models/hazard_yolov8.pt")
        candidate_paths = [
            configured_path,
            os.path.join(ml_dir, "models", "hazard_yolov8.pt"),
            os.path.join(ml_dir, "models", "pothole_yolov8.pt"),
            os.path.join(root_dir, "ml", "models", "hazard_yolov8.pt"),
            os.path.join(root_dir, "ml", "models", "pothole_yolov8.pt"),
            "ml/models/hazard_yolov8.pt",
            "ml/models/pothole_yolov8.pt",
            "models/hazard_yolov8.pt",
            "models/pothole_yolov8.pt",
        ]
        seen_paths = set()

        for p in candidate_paths:
            if not p or not os.path.exists(p):
                continue
            norm_p = os.path.normcase(os.path.abspath(p))
            if norm_p in seen_paths:
                continue
            seen_paths.add(norm_p)
            try:
                import torch
                from ultralytics import YOLO
                self.device = "cuda:0" if (hasattr(torch, 'cuda') and torch.cuda.is_available()) else "cpu"
                loaded = YOLO(p)
                self.models.append(loaded)
                print(f"[HazardDetector] Loaded hazard model weights from '{p}' on {self.device}.")
            except Exception as e:
                print(f"[HazardDetector] Failed to load model at '{p}': {e}")

        if self.models:
            self.model = self.models[0]
            self.is_available = True
            self.model_path = getattr(self.models[0], "model_name", candidate_paths[0])
        else:
            self.model = None
            self.model_path = configured_path
            self.is_available = False
            print(
                f"[HazardDetector] Notice: Trained hazard model not found at '{self.model_path}'. "
                f"Operating in graceful fallback mode (road hazard detections disabled). "
                f"Vehicle tracking and Stage 1/2 analytics remain fully functional. "
                f"To enable real road hazard detection, place trained YOLO weights at '{self.model_path}'."
            )

    def detect_hazards_in_frame(
        self,
        frame: np.ndarray,
        conf_threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Runs hazard detection on a single image frame.
        Applies class normalization, ROI filtering, severity scoring, and NMS.
        Detects potholes, road damage, and waterlogging.
        """
        if not self.is_available or frame is None or frame.size == 0:
            return []

        conf = conf_threshold if conf_threshold is not None else self.conf_threshold
        h, w = frame.shape[:2]
        all_detections: List[Dict[str, Any]] = []

        # 1. Run YOLO inference across loaded hazard / pothole models
        models_to_run = self.models if self.models else ([self.model] if self.model is not None else [])
        det_idx = 0

        for m_idx, current_model in enumerate(models_to_run):
            try:
                results = current_model.predict(
                    source=frame,
                    device=self.device,
                    conf=conf,
                    verbose=False
                )
            except Exception as e:
                print(f"[HazardDetector] Prediction error on model {m_idx}: {e}")
                continue

            if not results or len(results) == 0:
                continue

            res = results[0]
            boxes = res.boxes
            if boxes is None or len(boxes) == 0:
                continue

            names = res.names if hasattr(res, "names") and res.names else {}

            for box in boxes:
                cls_id = int(box.cls[0].item())
                raw_name = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else str(cls_id)
                norm_class = normalize_hazard_class(raw_name)

                # Skip unknown classes
                if norm_class == "unknown":
                    continue

                conf_val = float(box.conf[0].item())
                xyxy = box.xyxy[0].tolist()
                xmin, ymin, xmax, ymax = xyxy[0], xyxy[1], xyxy[2], xyxy[3]
                bbox = [xmin, ymin, xmax, ymax]

                # Filter by hazard ROI
                if not is_inside_hazard_roi(bbox, w, h, self.roi):
                    continue

                cx = (xmin + xmax) / 2.0
                cy = (ymin + ymax) / 2.0
                norm_x = max(0.0, min(1.0, xmin / w)) if w else 0.0
                norm_y = max(0.0, min(1.0, ymin / h)) if h else 0.0
                norm_w = max(0.01, min(1.0 - norm_x, (xmax - xmin) / w)) if w else 0.0
                norm_h = max(0.01, min(1.0 - norm_y, (ymax - ymin) / h)) if h else 0.0

                severity = calculate_hazard_severity(bbox, conf_val, w, h, self.severity_cfg)
                det_idx += 1

                all_detections.append({
                    "id": f"hazard-det-{det_idx}",
                    "class": norm_class,
                    "raw_class": raw_name,
                    "confidence": round(conf_val * 100, 1),
                    "bboxPixels": [round(xmin, 1), round(ymin, 1), round(xmax, 1), round(ymax, 1)],
                    "center": [round(cx, 1), round(cy, 1)],
                    "normalizedBbox": [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
                    "severity": severity,
                })

        # 2. Run Computer Vision Road Surface Waterlogging & Puddle Detection (Opt-in only; disabled by default to eliminate false positives on asphalt shadows/tar repairs)
        enable_cv_waterlogging = self.config.get("enable_cv_waterlogging", False) or os.getenv("ENABLE_CV_WATERLOGGING", "false").lower() == "true"
        if enable_cv_waterlogging:
            try:
                water_dets = detect_waterlogging_in_frame(frame, self.roi, self.severity_cfg)
                all_detections.extend(water_dets)
            except Exception as e:
                print(f"[HazardDetector] Waterlogging detector notice: {e}")

        # 3. Apply IoU Non-Maximum Suppression to remove duplicates across models
        deduped = apply_hazard_nms(all_detections, iou_threshold=0.45)
        return deduped

    def create_tracker(self, bus_id: str = "BUS-103") -> HazardIncidentTracker:
        """
        Instantiates a temporal/spatial deduplication tracker configured with this detector's parameters.
        """
        return HazardIncidentTracker(
            time_window_seconds=self.dedup_cfg.get("time_window_seconds", 5.0),
            distance_pixels=self.dedup_cfg.get("distance_pixels", 100.0),
            bus_id=bus_id
        )
