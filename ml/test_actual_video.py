import cv2
import os
from ml.inference.hazard_detector import HazardDetector, normalize_hazard_class

video_path = r"C:\Users\Kavipranaav LM\Downloads\pothole.mp4"
print("Testing video:", video_path)
cap = cv2.VideoCapture(video_path)
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"Resolution: {w}x{h}, FPS: {fps}, Total Frames: {count}")

hd = HazardDetector()
print(f"HazardDetector is_available: {hd.is_available}")
print(f"HazardDetector models count: {len(hd.models)}")
for i, m in enumerate(hd.models):
    print(f"  Model {i} classes count: {len(m.names)}")

# Test 1: with default ROI (x: 0.05..0.95, y: 0.35..1.00) and conf=0.15
print("\n--- Running on first 120 frames with conf=0.15 and default ROI ---")
frame_idx = 0
detections_found = []

while cap.isOpened() and frame_idx < 120:
    ret, frame = cap.read()
    if not ret:
        break
    if frame_idx % 10 == 0:
        res = hd.detect_hazards_in_frame(frame, conf_threshold=0.15)
        if res:
            t_sec = frame_idx / fps
            print(f"Frame {frame_idx:3d} (t={t_sec:.2f}s): {len(res)} detection(s)")
            for r in res:
                print(f"   Class: {r['class']} (raw: '{r['raw_class']}'), Conf: {r['confidence']}%, BBox: {r['bboxPixels']}, Severity: {r['severity']}")
                detections_found.append((frame_idx, r))
    frame_idx += 1
cap.release()

print(f"\nTotal detections with default ROI: {len(detections_found)}")

# Test 2: Full frame ROI
cap2 = cv2.VideoCapture(video_path)
hd.roi = {"x_min": 0.0, "y_min": 0.0, "x_max": 1.0, "y_max": 1.0}
print("\n--- Running on first 120 frames with conf=0.15 and full-frame ROI ---")
frame_idx = 0
detections_full_roi = []
while cap2.isOpened() and frame_idx < 120:
    ret, frame = cap2.read()
    if not ret:
        break
    if frame_idx % 10 == 0:
        res = hd.detect_hazards_in_frame(frame, conf_threshold=0.15)
        if res:
            t_sec = frame_idx / fps
            print(f"Frame {frame_idx:3d} (t={t_sec:.2f}s): {len(res)} detection(s)")
            for r in res:
                print(f"   Class: {r['class']} (raw: '{r['raw_class']}'), Conf: {r['confidence']}%, BBox: {r['bboxPixels']}, Severity: {r['severity']}")
                detections_full_roi.append((frame_idx, r))
    frame_idx += 1
cap2.release()
print(f"\nTotal detections with full-frame ROI: {len(detections_full_roi)}")
