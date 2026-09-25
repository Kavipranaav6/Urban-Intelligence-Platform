import cv2
from ml.inference.hazard_detector import HazardDetector, normalize_hazard_class

hd = HazardDetector()
print("HazardDetector loaded models:", len(hd.models))
for idx, m in enumerate(hd.models):
    print(f"  Model {idx} names count: {len(m.names)}")

cap = cv2.VideoCapture("test_traffic.mp4")
ret, frame = cap.read()
cap.release()

print("\n--- Predictions on frame 0 with conf=0.15, default ROI ---")
dets_def = hd.detect_hazards_in_frame(frame, conf_threshold=0.15)
print(f"Detections count: {len(dets_def)}")
for d in dets_def:
    print(" ", d["class"], d["raw_class"], d["confidence"], d["bboxPixels"], d["severity"])

print("\n--- Predictions on frame 0 with conf=0.15, full-frame ROI ---")
hd.roi = {"x_min": 0.0, "y_min": 0.0, "x_max": 1.0, "y_max": 1.0}
dets_full = hd.detect_hazards_in_frame(frame, conf_threshold=0.15)
print(f"Detections count: {len(dets_full)}")
for d in dets_full:
    print(" ", d["class"], d["raw_class"], d["confidence"], d["bboxPixels"], d["severity"])

print("\n--- Scanning all 30 frames with conf=0.15, full-frame ROI ---")
cap2 = cv2.VideoCapture("test_traffic.mp4")
f_idx = 0
all_dets = []
while cap2.isOpened():
    ret, frame = cap2.read()
    if not ret: break
    if f_idx % 5 == 0:
        res = hd.detect_hazards_in_frame(frame, conf_threshold=0.15)
        for r in res:
            all_dets.append((f_idx, r["class"], r["raw_class"], r["confidence"], r["bboxPixels"]))
    f_idx += 1
cap2.release()
print(f"Total hazard detections found across frames: {len(all_dets)}")
for d in all_dets:
    print(" ", d)
