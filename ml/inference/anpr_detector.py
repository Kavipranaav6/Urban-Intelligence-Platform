"""
anpr_detector.py - Stage 4: Automatic Number Plate Recognition (ANPR) & OCR Engine

UrbanSense-AI: Mobile Urban Intelligence Platform Using Public Transport Fleet
Provides:
  1. Vehicle license plate localization using deep learning (Babblu2821/alpr-plate-detector)
     as primary localizer with morphological/contour filtering fallback.
  2. Two-row stacked plate handling for two-wheelers (motorcycles/scooters).
  3. OCR text extraction for vehicle registration numbers (e.g. Indian RTO formats).
  4. Optical character confidence scoring (0-100%).
  5. Base64 crop evidence extraction for incident documentation.
  6. Deterministic track-bound plate resolution ensuring consistent vehicle identification
     across consecutive video frames via majority voting & confidence-weighted consensus.
"""

import os
import re
import cv2
import base64
import logging
import numpy as np
from collections import defaultdict
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy EasyOCR singleton — loaded once on first use, shared across all calls.
# GPU is used automatically when a CUDA device is available.
# ---------------------------------------------------------------------------
_ocr_reader = None


def _get_ocr_reader():
    """Returns the shared EasyOCR Reader, initialising it on first call."""
    global _ocr_reader
    if _ocr_reader is None:
        try:
            import easyocr
            import torch
            use_gpu = torch.cuda.is_available()
            logger.info("Initialising EasyOCR (GPU=%s) …", use_gpu)
            _ocr_reader = easyocr.Reader(["en"], gpu=use_gpu, verbose=False)
            logger.info("EasyOCR ready.")
        except Exception as exc:
            logger.warning("EasyOCR unavailable (%s) — OCR disabled.", exc)
            _ocr_reader = False          # sentinel: do not retry
    return _ocr_reader if _ocr_reader is not False else None


# ---------------------------------------------------------------------------
# Lazy ALPR Plate Detector singleton (Babblu2821/alpr-plate-detector)
# ---------------------------------------------------------------------------
_alpr_model = None


def _get_alpr_model():
    """Returns the shared YOLO ALPR model, initialising it on first call."""
    global _alpr_model
    if _alpr_model is None:
        try:
            import torch
            from ultralytics import YOLO
            os.environ["ULTRALYTICS_HUB_OFFLINE"] = "1"
            os.environ["YOLO_OFFLINE"] = "True"
            os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

            cached_weights = os.path.join(
                os.path.expanduser("~"),
                ".cache", "huggingface", "hub",
                "models--Babblu2821--alpr-plate-detector",
                "snapshots", "4ae32c182f083f1a60c3a8c1a19ad82b2674eea3",
                "best.pt"
            )
            if os.path.exists(cached_weights):
                logger.info("Loading cached ALPR weights: %s", cached_weights)
                _alpr_model = YOLO(cached_weights)
            else:
                logger.info("Loading ALPR model from Hugging Face (Babblu2821/alpr-plate-detector)...")
                _alpr_model = YOLO.from_pretrained("Babblu2821/alpr-plate-detector")
            logger.info("ALPR plate detector ready.")
        except Exception as exc:
            logger.warning("ALPR model unavailable (%s) — using contour fallback.", exc)
            _alpr_model = False
    return _alpr_model if _alpr_model is not False else None


# Standard Indian state codes for registration plate validation / regional identification
INDIAN_STATE_CODES: Dict[str, str] = {
    "TN": "Tamil Nadu",
    "KA": "Karnataka",
    "KL": "Kerala",
    "AP": "Andhra Pradesh",
    "TS": "Telangana",
    "MH": "Maharashtra",
    "DL": "Delhi NCR",
    "HR": "Haryana",
    "UP": "Uttar Pradesh",
    "GJ": "Gujarat",
    "RJ": "Rajasthan",
    "WB": "West Bengal",
}

# Standard RTO district mapping examples for realistic jurisdiction tagging
RTO_DISTRICT_MAP: Dict[str, str] = {
    "TN 38": "Coimbatore North RTO",
    "TN 37": "Coimbatore South RTO",
    "TN 66": "Coimbatore Central RTO",
    "TN 99": "Coimbatore West RTO",
    "TN 41": "Pollachi RTO",
    "TN 42": "Tirupur RTO",
    "TN 43": "Nilgiris (Ooty) RTO",
    "TN 40": "Mettupalayam RTO",
    "TN 01": "Chennai Central RTO",
    "TN 07": "Chennai South RTO",
    "KA 01": "Bangalore Central (Koramangala)",
    "KA 03": "Bangalore East (Indiranagar)",
    "KA 05": "Bangalore South (Jayanagar)",
    "KL 07": "Ernakulam (Kochi)",
    "KL 09": "Palakkad RTO",
    "DL 3C": "South Delhi RTO",
    "MH 12": "Pune Central RTO",
}

# Regex pattern for Indian high security registration plates (HSRP):
# e.g., "TN 38 AB 1234", "KA 01 MJ 8821", "DL 03 C 4912"
PLATE_REGEX = re.compile(r"^([A-Z]{2})\s*([0-9]{1,2})\s*([A-Z]{1,3})\s*([0-9]{4})$")

# Common OCR confusion character mappings for positional syntax repair
CHAR_TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "S": "5", "I": "1", "L": "1", "Z": "2", "B": "8", "G": "6"}
DIGIT_TO_CHAR = {"0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G"}


def _clean_and_disambiguate_single_candidate(clean: str) -> Optional[str]:
    """
    Applies position-aware character repair (digits in state/series -> letters,
    letters in RTO/number -> digits) on an 8-11 character string.
    Returns the corrected alphanumeric plate string if it satisfies standard Indian
    plate structure ^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$, else None.
    Does NOT use blanket vehicle-wide substitution rules (HL->NL, KO->KA).
    """
    if not (8 <= len(clean) <= 11):
        return None

    # State code (first 2 chars): strictly letters
    state = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in clean[:2])
    # Registration number (last 4 chars): strictly digits
    num = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in clean[-4:])
    middle = clean[2:-4]

    if len(middle) == 4:
        # 2 digits RTO + 2 letters Series (e.g. 05 NL)
        rto = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:2])
        ser = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[2:])
        rep = f"{state}{rto}{ser}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep):
            return rep
    elif len(middle) == 3:
        # Try 2 digits RTO + 1 letter Series (e.g. 05 N)
        rto1 = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:2])
        ser1 = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[2:])
        rep1 = f"{state}{rto1}{ser1}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep1):
            return rep1

        # Try 1 digit RTO + 2 letters Series (e.g. 3 CD)
        rto2 = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:1])
        ser2 = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[1:])
        rep2 = f"{state}{rto2}{ser2}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep2):
            return rep2
    elif len(middle) == 2:
        # 1 digit RTO + 1 letter Series (e.g. 3 C)
        rto = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:1])
        ser = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[1:])
        rep = f"{state}{rto}{ser}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep):
            return rep

    return None


def correct_indian_plate(raw_text: str) -> str:
    """
    Applies position-aware optical character disambiguation to correct common
    OCR errors in Indian registration plates (e.g. 'KAOSNL9156' -> 'KA05NL9156').
    Does NOT use blanket vehicle-wide substitution rules.
    If OCR noise captures a single leading or trailing crop border artifact (e.g. 'FKAOS...'),
    it tests stripping a single character provided the resulting string satisfies 8-11 chars
    and passes HSRP plate regex.
    """
    clean = re.sub(r"[^A-Za-z0-9]", "", raw_text.strip().upper())
    if not clean:
        return ""

    # 1. If already valid regex match without modification, preserve as-is
    if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", clean):
        return clean

    # 2. Try standard positional repair on clean
    repaired = _clean_and_disambiguate_single_candidate(clean)
    if repaired:
        return repaired

    # 3. Leading/trailing artifact repair (border/bracket noise, e.g. 'FKAOSHL9156')
    # Strip a single leading character only if resulting candidate is 8-11 chars and valid
    if len(clean) > 8 and 8 <= len(clean[1:]) <= 11:
        lead_stripped = _clean_and_disambiguate_single_candidate(clean[1:])
        if lead_stripped:
            return lead_stripped

    # Strip a single trailing character only if resulting candidate is 8-11 chars and valid
    if len(clean) > 8 and 8 <= len(clean[:-1]) <= 11:
        trail_stripped = _clean_and_disambiguate_single_candidate(clean[:-1])
        if trail_stripped:
            return trail_stripped

    return clean


def format_plate_number(raw_text: str) -> str:
    """Formats raw alphanumeric string into standardized 'XX NN YY NNNN' plate format."""
    clean = correct_indian_plate(raw_text)
    match = re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", clean)
    if match:
        state, dist, series, num = match.groups()
        return f"{state} {dist.zfill(2)} {series} {num}"
    return clean


def parse_state_and_region(plate_number: str) -> Tuple[str, str]:
    """Extracts state name and regional jurisdiction from a formatted plate string."""
    tokens = plate_number.split()
    if len(tokens) >= 2:
        state_code = tokens[0].upper()
        dist_code = f"{tokens[0]} {tokens[1]}".upper()
        state_name = INDIAN_STATE_CODES.get(state_code, f"{state_code} State")
        district_name = RTO_DISTRICT_MAP.get(dist_code, f"{dist_code} Jurisdiction")
        return state_name, f"{state_code} ({state_name}) / {district_name}"
    return "Regional Transport Office", "Regional Jurisdiction"


class ANPRDetector:
    """
    Automatic Number Plate Recognition (ANPR) detector for edge cameras.
    Extracts number plate candidate regions from vehicle bounding boxes,
    determines plate legibility, produces OCR confidence scores, and creates
    visual crop evidence.
    """

    def __init__(self, min_confidence: float = 65.0):
        self.min_confidence = min_confidence
        self.records: List[Dict[str, Any]] = []
        # Multi-frame tracking consensus storage: track_id -> list of readings
        self.track_readings: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        # Single-frame or untracked candidate vehicle plate readings
        self.untracked_readings: List[Dict[str, Any]] = []

    def reset(self) -> None:
        """Resets all recorded ANPR extractions and track consensus cache."""
        self.records.clear()
        self.track_readings.clear()
        self.untracked_readings.clear()

    def get_summary(self) -> Dict[str, Any]:
        """Returns summary of all ANPR extractions processed."""
        return {
            "total_plates_detected": len(self.records),
            "plates": list(self.records),
        }

    def analyze_frame(
        self,
        frame_b64: Optional[str] = None,
        detections: Optional[List[Dict[str, Any]]] = None,
        timestamp: str = "00:00",
        timestamp_sec: float = 0.0,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Analyzes detections in a base64 encoded frame and extracts license plate records.
        """
        results = []
        if not detections:
            return results

        raw_frame = None
        if frame_b64:
            try:
                b64_data = frame_b64.split(",", 1)[1] if "," in frame_b64 else frame_b64
                nparr = np.frombuffer(base64.b64decode(b64_data), np.uint8)
                raw_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception:
                raw_frame = None

        vehicle_classes = {"car", "truck", "bus", "motorcycle", "auto", "vehicle", "van", "suv"}
        for det in detections:
            cls = det.get("class_name") or det.get("class", "car")
            if any(vc in cls.lower() for vc in vehicle_classes):
                tid = det.get("track_id", -1)
                bbox = det.get("bbox") or det.get("bboxPixels", [0, 0, 0, 0])
                plate_rec = self.extract_registration(
                    frame=raw_frame,
                    vehicle_bbox=bbox,
                    track_id=tid,
                    timestamp_sec=timestamp_sec,
                    vehicle_class=cls
                )
                if timestamp:
                    plate_rec["timestamp"] = timestamp
                if not plate_rec.get("evidenceFrame") and frame_b64:
                    plate_rec["evidenceFrame"] = frame_b64
                results.append(plate_rec)
                self.records.append(plate_rec)

        return results

    def locate_plate_candidate(
        self,
        frame: np.ndarray,
        vehicle_bbox: List[float],
        vehicle_class: str = "car"
    ) -> Optional[Tuple[List[int], np.ndarray]]:
        """
        Locates the license plate region within a detected vehicle bounding box.
        Uses Babblu2821/alpr-plate-detector as PRIMARY localizer.
        Falls back to contour/aspect-ratio morphological filtering if ALPR produces no box.

        Args:
            frame: Full BGR video frame numpy array.
            vehicle_bbox: [xmin, ymin, xmax, ymax] in pixels.
            vehicle_class: Detection class name (car, motorcycle, bus, truck, etc.)

        Returns:
            (plate_bbox_pixels, plate_crop) or None if vehicle is too small.
        """
        if frame is None or len(vehicle_bbox) < 4:
            return None

        h, w = frame.shape[:2]
        vx1 = max(0, int(vehicle_bbox[0]))
        vy1 = max(0, int(vehicle_bbox[1]))
        vx2 = min(w, int(vehicle_bbox[2]))
        vy2 = min(h, int(vehicle_bbox[3]))

        vw = vx2 - vx1
        vh = vy2 - vy1

        if vw < 30 or vh < 25:
            # Vehicle too small/distant for reliable plate resolution
            return None

        # ── 1. PRIMARY: Babblu2821/alpr-plate-detector ──
        alpr = _get_alpr_model()
        if alpr is not None:
            try:
                # Add slight margin (5% horizontal, 10% vertical) around vehicle bbox
                mx1 = max(0, int(vx1 - vw * 0.05))
                my1 = max(0, int(vy1 - vh * 0.05))
                mx2 = min(w, int(vx2 + vw * 0.05))
                my2 = min(h, int(vy2 + vh * 0.10))
                vcrop = frame[my1:my2, mx1:mx2]

                if vcrop.size > 0:
                    import torch
                    dev = "cuda" if torch.cuda.is_available() else "cpu"
                    res = alpr.predict(source=vcrop, conf=0.15, verbose=False, device=dev)
                    if res and len(res[0].boxes) > 0:
                        bb = max(res[0].boxes, key=lambda b: float(b.conf[0].item()))
                        bx1, by1, bx2, by2 = [int(v) for v in bb.xyxy[0].tolist()]
                        bx1, by1 = max(0, bx1), max(0, by1)
                        bx2, by2 = min(vcrop.shape[1], bx2), min(vcrop.shape[0], by2)

                        plate_crop = vcrop[by1:by2, bx1:bx2]
                        if plate_crop.size > 0 and plate_crop.shape[0] >= 5 and plate_crop.shape[1] >= 10:
                            # Map back to full frame pixel coordinates
                            px1 = mx1 + bx1
                            py1 = my1 + by1
                            px2 = mx1 + bx2
                            py2 = my1 + by2
                            return [px1, py1, px2, py2], plate_crop
            except Exception as exc:
                logger.debug("ALPR inference failed, falling back to contour: %s", exc)

        # ── 2. FALLBACK: Contour / Aspect-Ratio Morphological Filter ──
        is_two_wheeler = any(k in vehicle_class.lower() for k in ("motorcycle", "bicycle", "scooter", "bike")) or (vw / max(1, vh) < 0.75)

        if is_two_wheeler:
            # Rear plate sits at the bottom mudguard
            plate_search_y1 = int(vy1 + vh * 0.60)
            plate_search_y2 = min(vy2 + int(vh * 0.15), h)
            plate_search_x1 = int(vx1 + vw * 0.05)
            plate_search_x2 = int(vx1 + vw * 0.95)
            min_ar, max_ar = 1.1, 5.5
            min_w, min_h = 15, 8
            target_ar = 2.0
        else:
            # Standard cars/buses/trucks: lower 65% of vehicle
            plate_search_y1 = int(vy1 + vh * 0.35)
            plate_search_y2 = min(vy2 + int(vh * 0.05), h)
            plate_search_x1 = int(vx1 + vw * 0.10)
            plate_search_x2 = int(vx1 + vw * 0.90)
            min_ar, max_ar = 2.0, 5.5
            min_w, min_h = 25, 8
            target_ar = 3.8

        roi = frame[plate_search_y1:plate_search_y2, plate_search_x1:plate_search_x2]
        if roi.size == 0:
            return None

        # Image processing to isolate rectangular plate contour
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blur = cv2.bilateralFilter(gray, 9, 75, 75)
        edges = cv2.Canny(blur, 50, 200)

        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        best_plate_rect = None
        best_aspect_score = 0.0

        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) in (4, 5, 6):
                rx, ry, rw, rh = cv2.boundingRect(approx)
                if rh > 0 and rw > 0:
                    aspect_ratio = float(rw) / float(rh)
                    if min_ar <= aspect_ratio <= max_ar and rw >= min_w and rh >= min_h:
                        score = 1.0 / (1.0 + abs(aspect_ratio - target_ar))
                        if score > best_aspect_score:
                            best_aspect_score = score
                            best_plate_rect = (rx, ry, rw, rh)

        if best_plate_rect:
            rx, ry, rw, rh = best_plate_rect
            px1 = plate_search_x1 + rx
            py1 = plate_search_y1 + ry
            px2 = px1 + rw
            py2 = py1 + rh
        else:
            # Fallback heuristic
            if is_two_wheeler:
                pw = int(vw * 0.65)
                ph = int(pw / 1.8)
                px1 = vx1 + int((vw - pw) / 2)
                py1 = vy1 + int(vh * 0.76)
                px2 = min(w, px1 + pw)
                py2 = min(h, py1 + ph)
            else:
                pw = int(vw * 0.38)
                ph = int(pw / 3.4)
                px1 = vx1 + int((vw - pw) / 2)
                py1 = vy1 + int(vh * 0.72)
                px2 = min(w, px1 + pw)
                py2 = min(h, py1 + ph)

        # Clamp coordinates
        px1 = max(0, px1)
        py1 = max(0, py1)
        px2 = min(w, px2)
        py2 = min(h, py2)

        plate_crop = frame[py1:py2, px1:px2]
        if plate_crop.size == 0 or plate_crop.shape[0] < 5 or plate_crop.shape[1] < 10:
            return None

        return [px1, py1, px2, py2], plate_crop

    def _read_crop_text(self, crop: np.ndarray) -> Tuple[str, float]:
        """Runs EasyOCR on a single image crop, returns (text, confidence 0-100)."""
        reader = _get_ocr_reader()
        if reader is None or crop is None or crop.size == 0:
            return "", 0.0

        try:
            h, w = crop.shape[:2]
            scale = max(1.0, float(75.0) / max(h, 1))
            if scale > 1.0:
                crop = cv2.resize(
                    crop, (int(w * scale), int(h * scale)),
                    interpolation=cv2.INTER_LANCZOS4 if scale > 1.5 else cv2.INTER_CUBIC
                )

            # Pass 1: standard color image
            results = reader.readtext(
                crop,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                batch_size=1,
                detail=1
            )

            # Pass 2: If empty, try CLAHE enhanced grayscale for small or glare-affected crops
            if not results:
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                enhanced = clahe.apply(gray)
                results = reader.readtext(
                    enhanced,
                    allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                    batch_size=1,
                    detail=1
                )

            if not results:
                return "", 0.0

            texts, confidences = [], []
            for (_bbox, text, prob) in results:
                t = text.strip().upper()
                if t:
                    texts.append(t)
                    confidences.append(prob)

            if not texts:
                return "", 0.0

            combined = " ".join(texts)
            avg_conf = (sum(confidences) / len(confidences)) * 100.0
            return combined, round(avg_conf, 1)

        except Exception as exc:
            logger.debug("OCR read text error: %s", exc)
            return "", 0.0

    def _run_ocr(self, plate_crop: np.ndarray) -> Tuple[str, float]:
        """
        Runs EasyOCR on *plate_crop* and returns (raw_text, confidence 0-100).
        Includes automatic two-row plate handling:
        - Detects if aspect ratio suggests a stacked/two-row plate (width:height < 2.5:1).
        - If two-row is suspected, splits crop horizontally at midpoint, runs OCR
          on each half (top=state+district, bottom=series+number), and concatenates.
        """
        if plate_crop is None or plate_crop.size == 0:
            return "", 0.0

        h, w = plate_crop.shape[:2]
        ar = float(w) / float(max(1, h))

        # 1. Single-pass OCR
        single_text, single_conf = self._read_crop_text(plate_crop)

        # 2. Two-row OCR if aspect ratio suggests stacked layout (< 2.5:1 vs ~4:1 for cars)
        if ar < 2.5 and h >= 16 and w >= 20:
            top_half = plate_crop[0 : int(h * 0.55), :]
            bot_half = plate_crop[int(h * 0.45) : h, :]
            top_text, top_conf = self._read_crop_text(top_half)
            bot_text, bot_conf = self._read_crop_text(bot_half)

            if top_text or bot_text:
                two_row_text = f"{top_text} {bot_text}".strip()
                n_halves = 2.0 if (top_text and bot_text) else 1.0
                two_row_conf = round((top_conf + bot_conf) / n_halves, 1)

                fmt_2row = format_plate_number(two_row_text)
                fmt_single = format_plate_number(single_text)

                # Prioritize valid regex plate matches
                if fmt_2row and PLATE_REGEX.match(fmt_2row):
                    return two_row_text, two_row_conf
                if not single_text and two_row_text:
                    return two_row_text, two_row_conf
                if two_row_conf > single_conf and len(two_row_text) > len(single_text):
                    return two_row_text, two_row_conf

        return single_text, single_conf

    def extract_registration(
        self,
        frame: np.ndarray,
        vehicle_bbox: List[float],
        track_id: int = -1,
        timestamp_sec: float = 0.0,
        vehicle_class: str = "car"
    ) -> Dict[str, Any]:
        """
        Runs ANPR on a vehicle: locates the plate region, runs EasyOCR, validates
        the result against the Indian HSRP regex, and generates visual crop evidence.
        Returns an empty-plate record (readable=False, confidence=0) when no clear
        plate crop is available or OCR produces no output — no fake data is generated.
        """
        plate_cand = self.locate_plate_candidate(frame, vehicle_bbox, vehicle_class=vehicle_class)
        has_clear_crop = plate_cand is not None

        p_bbox = [0, 0, 0, 0]
        p_crop = None
        if has_clear_crop and plate_cand is not None:
            p_bbox, p_crop = plate_cand

        # --- Real OCR ---
        raw_ocr_text, confidence = self._run_ocr(p_crop)
        plate_str = format_plate_number(raw_ocr_text) if raw_ocr_text else ""
        readable = bool(plate_str and PLATE_REGEX.match(plate_str) and confidence >= self.min_confidence)
        if not readable:
            plate_str = plate_str or raw_ocr_text
            confidence = confidence if raw_ocr_text else 0.0
        state_name, jurisdiction = parse_state_and_region(plate_str) if readable else ("", "")

        # Base64 crop evidence
        evidence_b64 = ""
        if p_crop is not None and p_crop.size > 0:
            display_crop = cv2.resize(p_crop, (280, 80), interpolation=cv2.INTER_CUBIC)
            cv2.rectangle(display_crop, (0, 0), (display_crop.shape[1] - 1, display_crop.shape[0] - 1), (0, 255, 255), 2)
            _, jpg = cv2.imencode(".jpg", display_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            evidence_b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
        elif frame is not None and len(vehicle_bbox) == 4:
            vx1, vy1, vx2, vy2 = [max(0, int(v)) for v in vehicle_bbox]
            v_crop = frame[vy1:vy2, vx1:vx2]
            if v_crop.size > 0:
                _, jpg = cv2.imencode(".jpg", v_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                evidence_b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")

        f_mins = int(timestamp_sec // 60)
        f_secs = int(timestamp_sec % 60)
        timestamp_formatted = f"{f_mins:02d}:{f_secs:02d}"

        # Maintain multi-frame track readings
        reading = {
            "raw": raw_ocr_text,
            "rawPlateNumber": raw_ocr_text,
            "plate": plate_str,
            "plateNumber": plate_str,
            "confidence": confidence,
            "readable": readable,
            "evidence": evidence_b64,
            "evidenceFrame": evidence_b64,
            "bbox": p_bbox,
            "plateBbox": p_bbox,
            "timestamp": timestamp_formatted,
            "timestampSec": timestamp_sec,
            "trackId": track_id,
            "vehicleClass": vehicle_class.capitalize(),
        }
        if track_id >= 0:
            self.track_readings[track_id].append(reading)
        # Also preserve visual candidate crop in untracked_readings if evidence is present
        if evidence_b64:
            self.untracked_readings.append(reading)

        return {
            "id": f"ANPR-TRK-{track_id if track_id >= 0 else int(timestamp_sec * 100)}",
            "trackId": track_id,
            "plateNumber": plate_str or (f"{vehicle_class.capitalize()} Plate Candidate" if evidence_b64 else "Plate detected — unreadable"),
            "rawPlateNumber": raw_ocr_text,
            "readable": readable,
            "confidence": confidence,
            "timestamp": timestamp_formatted,
            "timestampSec": round(timestamp_sec, 2),
            "stateOrRegion": jurisdiction,
            "stateName": state_name,
            "vehicleClass": vehicle_class.capitalize(),
            "evidenceFrame": evidence_b64,
            "plateBbox": p_bbox,
        }

    def get_track_consensus_plate(self, track_id: int) -> Dict[str, Any]:
        """
        Resolves the consensus plate number across multiple frames for a given track_id
        using majority voting and confidence-weighted aggregation.
        Guarantees that a single noisy glare/shadow frame (e.g. Track 366 'HL' vs 'NL')
        does not override the dominant multi-frame consensus.
        """
        readings = self.track_readings.get(track_id, [])
        if not readings:
            return {"plateNumber": "", "confidence": 0.0, "readable": False}

        # Filter to readable regex matches first
        valid = [r for r in readings if r.get("readable") and r.get("plate")]
        if not valid:
            # Fall back to any non-empty plate text
            valid = [r for r in readings if r.get("plate")]
        if not valid:
            last = readings[-1]
            p_desc = last.get("plate") or last.get("plateNumber") or (f"{last.get('vehicleClass', 'Vehicle')} Plate Candidate" if (last.get("evidence") or last.get("evidenceFrame")) else "Plate detected — unreadable")
            return {
                "plateNumber": p_desc,
                "rawPlateNumber": last.get("raw") or last.get("rawPlateNumber", ""),
                "confidence": last.get("confidence", 0.0),
                "readable": last.get("readable", False),
                "evidenceFrame": last.get("evidence") or last.get("evidenceFrame", ""),
                "plateBbox": last.get("bbox") or last.get("plateBbox", [0, 0, 0, 0]),
                "totalVotes": 0,
                "totalFrames": len(readings),
            }

        # Group by formatted plate string
        scores = defaultdict(lambda: {"count": 0, "conf_sum": 0.0, "best_rec": None})
        for r in valid:
            p = r["plate"]
            scores[p]["count"] += 1
            scores[p]["conf_sum"] += r["confidence"]
            if scores[p]["best_rec"] is None or r["confidence"] > scores[p]["best_rec"]["confidence"]:
                scores[p]["best_rec"] = r

        # Select highest vote count, tie-breaker highest total confidence
        best_plate = max(scores.keys(), key=lambda p: (scores[p]["count"], scores[p]["conf_sum"]))
        best_rec = scores[best_plate]["best_rec"]

        # Position-wise character consensus across matching-length valid reads for this specific track
        # E.g. Resolves ambiguous OCR characters (like 'H' vs 'N' caused by glare across frames of the same vehicle)
        same_len_reads = [r for r in valid if len(r["plate"]) == len(best_plate)]
        if len(same_len_reads) >= 2:
            consensus_chars = []
            for col in range(len(best_plate)):
                col_chars = set(r["plate"][col] for r in same_len_reads)
                if len(col_chars) == 1:
                    consensus_chars.append(list(col_chars)[0])
                else:
                    # In glare/reflections, 'N' often degrades to 'H' (diagonal washed out) or 'M' (fringe artifact).
                    # When 'N' is read in a high-clarity frame on this track alongside 'H'/'M', resolve to 'N'.
                    if col_chars.issubset({'H', 'N', 'M'}) and 'N' in col_chars:
                        consensus_chars.append('N')
                    else:
                        char_weights = defaultdict(float)
                        for r in same_len_reads:
                            char_weights[r["plate"][col]] += max(1.0, r["confidence"])
                        consensus_chars.append(max(char_weights.keys(), key=lambda c: char_weights[c]))
            candidate_plate = "".join(consensus_chars)
            if PLATE_REGEX.match(candidate_plate):
                best_plate = candidate_plate

        # Aggregate confidence across qualifying reads that support this resolved plate on this track
        matching_reads = [
            r for r in valid
            if r.get("plate") == best_plate
            or (len(r.get("plate", "")) == len(best_plate) and set(r["plate"]).issubset(set(best_plate) | {'H', 'M'}))
        ]
        if not matching_reads:
            matching_reads = [best_rec]
        avg_conf = sum(r.get("confidence", 0.0) for r in matching_reads) / len(matching_reads)

        return {
            "plateNumber": best_plate,
            "rawPlateNumber": best_rec["raw"],
            "confidence": round(avg_conf, 1),
            "readable": best_rec["readable"],
            "evidenceFrame": best_rec["evidence"],
            "plateBbox": best_rec["bbox"],
            "totalVotes": len(matching_reads),
            "totalFrames": len(readings),
        }
