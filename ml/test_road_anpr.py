import os, sys, cv2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from ml.inference.anpr_detector import ANPRDetector
from ultralytics import YOLO

anpr = ANPRDetector()
cap = cv2.VideoCapture('videos/road.mp4')
yolo = YOLO('yolov8n.pt')

print('Testing ALPR on road.mp4...')
for fi in range(60, 360, 30):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: break
    res = yolo.predict(frame, conf=0.25, verbose=False)[0]
    for b in res.boxes:
        cls_name = yolo.names[int(b.cls[0])]
        if cls_name in ('car', 'motorcycle', 'truck', 'bus'):
            bbox = [int(x) for x in b.xyxy[0]]
            plate_cand = anpr.locate_plate_candidate(frame, bbox)
            if plate_cand:
                p_bbox, p_crop = plate_cand
                raw_text, conf = anpr._run_ocr(p_crop)
                print(f'Frame {fi} [{cls_name}]: Plate bbox={p_bbox}, OCR raw="{raw_text}", conf={conf}%')
            else:
                # print(f'Frame {fi} [{cls_name}]: No plate candidate')
                pass
cap.release()
print('Done test.')
