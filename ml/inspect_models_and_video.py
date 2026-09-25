import cv2
import os
import numpy as np
from ultralytics import YOLO

cap = cv2.VideoCapture("test_traffic.mp4")
ret, frame = cap.read()
if ret:
    cv2.imwrite("ml/frame_0.jpg", frame)
    print("Saved ml/frame_0.jpg")
cap.release()

model_h = YOLO("ml/models/hazard_yolov8.pt")
model_p = YOLO("ml/models/pothole_yolov8.pt")

print("model_h info:")
print(f"  Names: {model_h.names}")
print(f"  Task: {getattr(model_h, 'task', None)}")

# Let's test with very low conf=0.01 on frame_0
res_h = model_h.predict("ml/frame_0.jpg", conf=0.01, verbose=False)[0]
print(f"hazard_yolov8 detections at conf=0.01: {len(res_h.boxes)}")
for b in res_h.boxes:
    cls_id = int(b.cls[0].item())
    print(f"  hazard: {res_h.names[cls_id]}, conf: {float(b.conf[0].item()):.4f}, xyxy: {b.xyxy[0].tolist()}")

res_p = model_p.predict("ml/frame_0.jpg", conf=0.01, verbose=False)[0]
print(f"pothole_yolov8 detections at conf=0.01: {len(res_p.boxes)}")
for b in res_p.boxes:
    cls_id = int(b.cls[0].item())
    print(f"  pothole: {res_p.names[cls_id]}, conf: {float(b.conf[0].item()):.4f}, xyxy: {b.xyxy[0].tolist()}")
