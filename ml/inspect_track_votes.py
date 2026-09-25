import os, sys, cv2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector

yolo = YOLODetector()
anpr = ANPRDetector(min_confidence=40.0)

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
# The early burst timestamps from EdgeCameraFeed.tsx
earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]

for idx, sec in enumerate(earlyBurst):
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    resized = cv2.resize(frame, (1280, 720))
    dets = yolo.track_frame(resized, conf_threshold=0.25, persist=(idx > 0))
    for d in dets:
        if d.get("class") == "car":
            tid = d.get("track_id", -1)
            bbox = d.get("bboxPixels", [0,0,0,0])
            if tid >= 0:
                anpr.extract_registration(resized, bbox, track_id=tid, timestamp_sec=sec, vehicle_class="car")

for tid, reads in sorted(anpr.track_readings.items()):
    valid = [r for r in reads if r.get("plate")]
    if valid:
        print(f"\n--- Track {tid} ({len(reads)} total frames, {len(valid)} valid) ---")
        for r in reads:
            print(f"  Frame {r['timestampSec']}s: raw='{r['raw']}' plate='{r['plate']}' conf={r['confidence']}% readable={r['readable']}")
        cons = anpr.get_track_consensus_plate(tid)
        print(f"  CONSENSUS: plate='{cons.get('plateNumber')}' conf={cons.get('confidence')}% votes={cons.get('totalVotes')}")
