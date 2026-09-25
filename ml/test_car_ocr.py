import os, sys, cv2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.anpr_detector import ANPRDetector

anpr = ANPRDetector()
cap = cv2.VideoCapture('videos/driving.mp4')
print("Testing car detection...")

for fi in range(40, 80, 2):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    cand = anpr.locate_plate_candidate(frame, [750, 350, 1200, 720])
    if cand:
        p_bbox, p_crop = cand
        raw_text, conf = anpr._run_ocr(p_crop)
        if raw_text:
            print(f"Frame {fi:02d}: bbox={p_bbox} text='{raw_text}' conf={conf}%")

cap.release()
