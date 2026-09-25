import cv2
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector, format_plate_number

yolo = YOLODetector()
anpr = ANPRDetector()

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
duration = 24.5
targetTimestamps = [t for t in earlyBurst if t < duration - 0.2]
remainingStart = targetTimestamps[-1] + 1.2
if remainingStart < duration:
    remainingSlots = min(12, max(3, int((duration - remainingStart) / 1.6)))
    for j in range(remainingSlots):
        t = remainingStart + (j / max(1, remainingSlots - 1)) * (duration - remainingStart - 0.2)
        targetTimestamps.append(round(t, 2))

print(f"Total timestamps: {len(targetTimestamps)}")

track_records = {}

for idx, sec in enumerate(targetTimestamps):
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        continue
    resized = cv2.resize(frame, (1280, 720))
    dets = yolo.track_frame(resized, conf_threshold=0.25, persist=(idx > 0))
    for d in dets:
        tid = d.get("track_id", -1)
        cls = d.get("class", "")
        bbox = d.get("bboxPixels", [0,0,0,0])
        if cls in ("car", "truck", "bus", "motorcycle"):
            rec = anpr.extract_registration(resized, bbox, track_id=tid, timestamp_sec=sec, vehicle_class=cls)
            if tid not in track_records:
                track_records[tid] = []
            track_records[tid].append({
                "idx": idx,
                "fi": fi,
                "sec": sec,
                "bbox": [round(x, 1) for x in bbox],
                "plate": rec["plateNumber"],
                "raw": rec["rawPlateNumber"],
                "conf": rec["confidence"],
                "readable": rec["readable"],
                "class": cls
            })

cap.release()

print("\n=== PER-TRACK ANALYSIS FOR ALL TRACKS WITH READS ===")
for tid, frames in sorted(track_records.items()):
    plates = [f["plate"] for f in frames if f["plate"]]
    confs = [f["conf"] for f in frames if f["conf"] > 0]
    if plates or confs:
        cons = anpr.get_track_consensus_plate(tid)
        print(f"\n--- Track #{tid} ({len(frames)} frames) Consensus: '{cons.get('plateNumber')}' (conf: {cons.get('confidence')}%) ---")
        for f in frames:
            print(f"  Frame idx={f['idx']:02d} fi={f['fi']:03d} t={f['sec']:.2f}s | BBox={f['bbox']} | Raw='{f['raw']}' -> Plate='{f['plate']}' (conf: {f['conf']}%, readable: {f['readable']})")
