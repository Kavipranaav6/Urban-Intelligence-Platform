import cv2
import numpy as np
from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector

vd = YOLODetector('yolov8n.pt')
anpr = ANPRDetector()

cap = cv2.VideoCapture("videos/driving.mp4")
cap.set(cv2.CAP_PROP_POS_FRAMES, 46)
ret, frame = cap.read()
cap.release()

# 1. On full frame (1838x892)
dets_full = vd.track_frame(frame, conf_threshold=0.25, persist=True)
print(f"Full frame (1838x892) detections: {len(dets_full)}")
for d in dets_full:
    print(f"  {d['class']} #{d.get('track_id')} bbox={d.get('bboxPixels')}")
    if d['class'] in ('car', 'motorcycle'):
        res = anpr.extract_registration(frame, d['bboxPixels'], d.get('track_id', 1), 1.53, d['class'])
        print(f"    -> ANPR: plate='{res.get('plateNumber')}' conf={res.get('confidence')}% readable={res.get('readable')}")

# 2. On resized frame (640x360)
small = cv2.resize(frame, (640, 360))
dets_small = vd.track_frame(small, conf_threshold=0.25, persist=True)
print(f"\nResized frame (640x360) detections: {len(dets_small)}")
for d in dets_small:
    print(f"  {d['class']} #{d.get('track_id')} bbox={d.get('bboxPixels')}")
    if d['class'] in ('car', 'motorcycle'):
        res = anpr.extract_registration(small, d['bboxPixels'], d.get('track_id', 1), 1.53, d['class'])
        print(f"    -> ANPR: plate='{res.get('plateNumber')}' conf={res.get('confidence')}% readable={res.get('readable')}")
