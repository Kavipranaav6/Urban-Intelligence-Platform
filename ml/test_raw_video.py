import cv2
import os
from ultralytics import YOLO
from ml.inference.hazard_detector import HazardDetector, normalize_hazard_class, is_inside_hazard_roi

video_path = "test_traffic.mp4"
if not os.path.exists(video_path):
    print(f"Error: {video_path} not found")
    exit(1)

cap = cv2.VideoCapture(video_path)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"Video Info: {width}x{height}, FPS: {fps}, Total Frames: {total_frames}")

# Load raw models directly to observe raw predictions before any filtering
model_hazard = YOLO("ml/models/hazard_yolov8.pt")
model_pothole = YOLO("ml/models/pothole_yolov8.pt")

print(f"\n--- Checking raw model detections at conf=0.10 across frames (interval 5) ---")
frame_idx = 0
raw_detections = []

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    if frame_idx % 5 == 0:
        # Check model_hazard
        res_h = model_hazard.predict(frame, conf=0.10, verbose=False)[0]
        if res_h.boxes is not None and len(res_h.boxes) > 0:
            for b in res_h.boxes:
                cls_id = int(b.cls[0].item())
                raw_name = res_h.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                xyxy = [round(x, 1) for x in b.xyxy[0].tolist()]
                norm_cls = normalize_hazard_class(raw_name)
                inside_roi_default = is_inside_hazard_roi(xyxy, width, height, {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00})
                raw_detections.append({
                    "frame": frame_idx,
                    "model": "hazard_yolov8",
                    "raw_class": raw_name,
                    "norm_class": norm_cls,
                    "conf": round(conf, 4),
                    "xyxy": xyxy,
                    "inside_default_roi": inside_roi_default
                })

        # Check model_pothole
        res_p = model_pothole.predict(frame, conf=0.10, verbose=False)[0]
        if res_p.boxes is not None and len(res_p.boxes) > 0:
            for b in res_p.boxes:
                cls_id = int(b.cls[0].item())
                raw_name = res_p.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                xyxy = [round(x, 1) for x in b.xyxy[0].tolist()]
                norm_cls = normalize_hazard_class(raw_name)
                inside_roi_default = is_inside_hazard_roi(xyxy, width, height, {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00})
                raw_detections.append({
                    "frame": frame_idx,
                    "model": "pothole_yolov8",
                    "raw_class": raw_name,
                    "norm_class": norm_cls,
                    "conf": round(conf, 4),
                    "xyxy": xyxy,
                    "inside_default_roi": inside_roi_default
                })

    frame_idx += 1

cap.release()

print(f"Total raw detection events found (conf >= 0.10): {len(raw_detections)}")
for d in raw_detections:
    print(f"Frame {d['frame']:3d} | Model: {d['model']:15s} | Raw: '{d['raw_class']}' -> Norm: '{d['norm_class']}' | Conf: {d['conf']:.3f} | BBox: {d['xyxy']} | InsideROI: {d['inside_default_roi']}")
