import os
import sys
import cv2
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.anpr_detector import (
    ANPRDetector,
    correct_indian_plate,
    format_plate_number,
    PLATE_REGEX,
    _get_alpr_model,
    _get_ocr_reader,
)
from ml.inference.detector import YOLODetector

print("=== INITIALIZING MODELS ===")
yolo = YOLODetector()
anpr = ANPRDetector(min_confidence=65.0)
alpr = _get_alpr_model()
ocr = _get_ocr_reader()

print(f"YOLO loaded: {yolo is not None}")
print(f"ALPR model loaded: {alpr is not None}")
print(f"EasyOCR reader loaded: {ocr is not None}")

# Let's test driving.mp4
VIDEO_PATH = "videos/driving.mp4"
cap = cv2.VideoCapture(VIDEO_PATH)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"Video: {VIDEO_PATH} ({w}x{h}, {total_frames} frames, {fps} fps)")

# Specifically inspect timestamps from early burst and frames 40-85 where vehicles appear
early_burst_secs = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
test_frame_indices = sorted(list(set(
    [int(round(s * fps)) for s in early_burst_secs] +
    list(range(40, 85, 2))
)))

print(f"Testing {len(test_frame_indices)} frames: {test_frame_indices[:10]}...{test_frame_indices[-5:]}")
print("-" * 80)

vehicle_classes = {"car", "truck", "bus", "motorcycle", "auto", "vehicle", "van", "suv"}

results = []

for fi in test_frame_indices:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        continue
    
    # 1. Native frame YOLO detection
    sec = fi / fps
    dets = yolo.track_frame(frame, conf_threshold=0.25, persist=True)
    v_dets = [d for d in dets if any(vc in d.get("class", "").lower() for vc in vehicle_classes)]
    
    if not v_dets:
        continue

    for vd in v_dets:
        cls = vd.get("class", "car")
        tid = vd.get("track_id", -1)
        v_bbox = vd.get("bboxPixels", [0, 0, 0, 0])
        vw = v_bbox[2] - v_bbox[0]
        vh = v_bbox[3] - v_bbox[1]

        # Stage 1: Localization
        plate_cand = anpr.locate_plate_candidate(frame, v_bbox, vehicle_class=cls)
        
        has_cand = plate_cand is not None
        p_bbox = [0, 0, 0, 0]
        p_crop = None
        crop_dims = (0, 0)
        
        if has_cand:
            p_bbox, p_crop = plate_cand
            crop_dims = (p_crop.shape[1], p_crop.shape[0]) # (width, height)
        
        # Stage 2: OCR
        raw_ocr_text = ""
        conf = 0.0
        if p_crop is not None:
            raw_ocr_text, conf = anpr._run_ocr(p_crop)

        # Stage 3: Disambiguation
        disambiguated = correct_indian_plate(raw_ocr_text) if raw_ocr_text else ""
        
        # Stage 4: Formatting
        formatted = format_plate_number(raw_ocr_text) if raw_ocr_text else ""

        # Stage 5: Validation
        regex_match = bool(PLATE_REGEX.match(formatted)) if formatted else False
        conf_pass = conf >= anpr.min_confidence
        readable = bool(formatted and regex_match and conf_pass)

        # Also full extract_registration call for parity
        full_rec = anpr.extract_registration(frame, v_bbox, track_id=tid, timestamp_sec=sec, vehicle_class=cls)

        rec = {
            "frame": fi,
            "sec": round(sec, 2),
            "class": cls,
            "track_id": tid,
            "v_bbox": [round(x, 1) for x in v_bbox],
            "crop_found": has_cand,
            "crop_dims": crop_dims,
            "p_bbox": p_bbox,
            "raw_ocr": raw_ocr_text,
            "conf": conf,
            "disambiguated": disambiguated,
            "formatted": formatted,
            "regex_match": regex_match,
            "conf_pass": conf_pass,
            "readable": readable,
            "full_rec_readable": full_rec["readable"],
            "full_rec_plate": full_rec["plateNumber"]
        }
        results.append(rec)
        
        if has_cand or raw_ocr_text:
            print(f"F{fi:03d} ({sec:.2f}s) | {cls}#{tid} ({vw:.0f}x{vh:.0f}) | Crop: {crop_dims[0]}x{crop_dims[1]} | Raw OCR: '{raw_ocr_text}' ({conf}%) | Disambig: '{disambiguated}' | Fmt: '{formatted}' | Regex: {regex_match} | Conf>=65: {conf_pass} | Readable: {readable}")

cap.release()

print("\n=== SUMMARY OF READABLE PLATES ===")
readable_recs = [r for r in results if r["readable"]]
print(f"Total readable detections: {len(readable_recs)}")
for r in readable_recs:
    print(f"  Frame {r['frame']} ({r['sec']}s) | Track #{r['track_id']} | Plate: {r['formatted']} | Conf: {r['conf']}%")

print("\n=== SUMMARY OF TRACK CONSENSUS ===")
for tid in sorted(set(r["track_id"] for r in results if r["track_id"] >= 0)):
    cons = anpr.get_track_consensus_plate(tid)
    print(f"  Track #{tid}: Plate='{cons.get('plateNumber')}' Raw='{cons.get('rawPlateNumber')}' Conf={cons.get('confidence')}% Readable={cons.get('readable')} Votes={cons.get('totalVotes')}/{cons.get('totalFrames')}")
