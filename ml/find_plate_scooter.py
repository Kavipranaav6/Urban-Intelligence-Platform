import cv2
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ml.inference.anpr_detector import _get_ocr_reader

reader = _get_ocr_reader()
frame0 = cv2.imread('ml/debug_crops/frames/f0000.jpg')
h, w = frame0.shape[:2]

# Run OCR on bottom half of frame 0
bottom_half = frame0[int(h*0.3):, :]
res = reader.readtext(bottom_half, detail=1)
print(f"OCR found {len(res)} text blocks in bottom half of frame 0:")
for bbox, text, prob in res:
    print(f"  bbox={bbox} text='{text}' prob={prob:.2f}")

# Also test frames 10, 20, 30, 40, 50, 55, 60
cap = cv2.VideoCapture('videos/driving.mp4')
for fi in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, fr = cap.read()
    if not ret: continue
    # Scan middle-bottom band where vehicles are: y from 350 to 850
    band = fr[350:850, :]
    r = reader.readtext(band, detail=1)
    found = [f"{t} ({p:.2f})" for _, t, p in r if p > 0.2]
    if found:
        print(f"Frame {fi:02d}: {found}")
cap.release()
