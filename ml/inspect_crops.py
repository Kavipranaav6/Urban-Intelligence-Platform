import os, sys, cv2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from ml.inference.anpr_detector import ANPRDetector
from ultralytics import YOLO

anpr = ANPRDetector()
cap = cv2.VideoCapture('videos/road.mp4')
yolo = YOLO('yolov8n.pt')

print("Scanning road.mp4 frames for clear vehicles...")
os.makedirs('scratch/test_crops', exist_ok=True)
count = 0

for fi in range(0, 450, 15):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: break
    res = yolo.predict(frame, conf=0.25, verbose=False)[0]
    for b in res.boxes:
        cls_name = yolo.names[int(b.cls[0])]
        if cls_name in ('car', 'motorcycle', 'truck', 'bus'):
            v_bbox = [int(x) for x in b.xyxy[0]]
            vw = v_bbox[2] - v_bbox[0]
            vh = v_bbox[3] - v_bbox[1]
            if vw > 60 and vh > 40:
                plate_cand = anpr.locate_plate_candidate(frame, v_bbox, vehicle_class=cls_name)
                if plate_cand:
                    p_bbox, p_crop = plate_cand
                    raw_text, conf = anpr._run_ocr(p_crop)
                    print(f"Frame {fi} [{cls_name}]: v_bbox={v_bbox} (w={vw}, h={vh}), p_bbox={p_bbox}, raw='{raw_text}', conf={conf}%")
                    if p_crop is not None and p_crop.size > 0:
                        cv2.imwrite(f"scratch/test_crops/f{fi}_{cls_name}_{count}.jpg", p_crop)
                        count += 1
cap.release()
print(f"Saved {count} crops.")
