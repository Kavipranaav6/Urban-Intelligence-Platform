import cv2
from ml.inference.detector import YOLODetector

vd = YOLODetector('yolov8n.pt')
cap = cv2.VideoCapture('videos/driving.mp4')

for fi in range(0, 16):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: break
    dets = vd.track_frame(frame, conf_threshold=0.25, persist=True)
    motos = [d for d in dets if 'motor' in d.get('class', '') or d.get('track_id') in (8, 6)]
    for m in motos:
        print(f"fi={fi} tid={m.get('track_id')} bbox={m.get('bboxPixels')}")
