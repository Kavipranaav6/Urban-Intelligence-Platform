import cv2
from ultralytics import YOLO

cap = cv2.VideoCapture("test_traffic.mp4")
model_h = YOLO("ml/models/hazard_yolov8.pt")
model_p = YOLO("ml/models/pothole_yolov8.pt")

frame_idx = 0
max_conf_h = 0.0
max_conf_p = 0.0
detections_all = []

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    
    # Predict with conf=0.001 to see all raw predictions
    res_h = model_h.predict(frame, conf=0.001, verbose=False)[0]
    if res_h.boxes:
        for b in res_h.boxes:
            c = float(b.conf[0].item())
            cls_id = int(b.cls[0].item())
            if c > max_conf_h:
                max_conf_h = c
            if c >= 0.03:
                detections_all.append((frame_idx, "hazard", res_h.names[cls_id], c, [round(x,1) for x in b.xyxy[0].tolist()]))

    res_p = model_p.predict(frame, conf=0.001, verbose=False)[0]
    if res_p.boxes:
        for b in res_p.boxes:
            c = float(b.conf[0].item())
            cls_id = int(b.cls[0].item())
            if c > max_conf_p:
                max_conf_p = c
            if c >= 0.03:
                detections_all.append((frame_idx, "pothole", res_p.names[cls_id], c, [round(x,1) for x in b.xyxy[0].tolist()]))

    frame_idx += 1

cap.release()

print(f"Max conf hazard_yolov8 across all frames: {max_conf_h:.4f}")
print(f"Max conf pothole_yolov8 across all frames: {max_conf_p:.4f}")
print(f"Detections with conf >= 0.03: {len(detections_all)}")
for d in detections_all:
    print(d)
