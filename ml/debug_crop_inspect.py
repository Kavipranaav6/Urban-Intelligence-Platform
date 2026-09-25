"""
debug_crop_inspect.py
Saves plate crops from the synthetic clip to disk for visual inspection,
and tries OCR with progressively looser settings to find what breaks.

Run with: ml\venv310\Scripts\python.exe ml\debug_crop_inspect.py
"""
import sys, os, cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

DEBUG_DIR = os.path.join(ROOT, "ml", "debug_crops")
os.makedirs(DEBUG_DIR, exist_ok=True)

from ml.inference.anpr_detector import ANPRDetector, _get_ocr_reader

VIDEO = os.path.join(ROOT, "test_rash_synthetic.mp4")

W, H, FPS, N = 1280, 720, 10, 40
CAR_W, CAR_H = 240, 140
CX0, CY0 = 960.0, 280.0
SLOW_FRAMES = 9
TRACK_ID = 7

def car_bbox(fi):
    if fi <= SLOW_FRAMES:
        cx, cy = CX0 - fi*4.0, CY0 + fi*1.0
    else:
        cx = (CX0 - SLOW_FRAMES*4.0) - (fi-SLOW_FRAMES)*85.0
        cy = (CY0 + SLOW_FRAMES*1.0) + (fi-SLOW_FRAMES)*2.0
    return [cx - CAR_W/2, cy - CAR_H/2, cx + CAR_W/2, cy + CAR_H/2]

print("=" * 60)
print("CROP INSPECTION - saving crops from frames 9..20 to disk")
print("Output dir: " + DEBUG_DIR)
print("=" * 60)

anpr = ANPRDetector(min_confidence=40.0)
cap = cv2.VideoCapture(VIDEO)

reader = _get_ocr_reader()
print("EasyOCR reader: " + ("loaded" if reader else "FAILED"))
print()

for fi in range(9, min(21, N)):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        print("  Frame " + str(fi) + ": could not read")
        continue

    bbox = car_bbox(fi)
    bx1, by1, bx2, by2 = [int(v) for v in bbox]

    # Save full frame with bbox drawn
    frame_vis = frame.copy()
    cv2.rectangle(frame_vis, (max(0,bx1), max(0,by1)), (min(W-1,bx2), min(H-1,by2)), (0,255,0), 2)

    # Also draw the plate search ROI
    vw = bx2 - bx1; vh = by2 - by1
    roi_y1 = int(by1 + vh * 0.45)
    roi_y2 = int(by1 + vh * 0.95)
    roi_x1 = int(bx1 + vw * 0.15)
    roi_x2 = int(bx1 + vw * 0.85)
    cv2.rectangle(frame_vis, (roi_x1, roi_y1), (roi_x2, roi_y2), (255, 0, 0), 1)

    frame_path = os.path.join(DEBUG_DIR, "frame_" + str(fi).zfill(2) + "_full.jpg")
    cv2.imwrite(frame_path, frame_vis)

    cand = anpr.locate_plate_candidate(frame, bbox)
    if cand is None:
        print("  Frame " + str(fi).rjust(2) + ": localizer=MISS (no candidate)")
        continue

    p_bbox, p_crop = cand
    crop_h, crop_w = p_crop.shape[:2]

    # Save raw crop
    crop_name = "frame_" + str(fi).zfill(2) + "_crop_raw_" + str(crop_w) + "x" + str(crop_h) + ".png"
    crop_path = os.path.join(DEBUG_DIR, crop_name)
    cv2.imwrite(crop_path, p_crop)

    # Save 3x upscaled crop
    crop_up = cv2.resize(p_crop, (crop_w*3, crop_h*3), interpolation=cv2.INTER_CUBIC)
    crop_up_name = "frame_" + str(fi).zfill(2) + "_crop_3x_" + str(crop_w*3) + "x" + str(crop_h*3) + ".png"
    crop_up_path = os.path.join(DEBUG_DIR, crop_up_name)
    cv2.imwrite(crop_up_path, crop_up)

    # Also try CLAHE-enhanced upscale
    gray = cv2.cvtColor(crop_up, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    gray_clahe = clahe.apply(gray)
    clahe_name = "frame_" + str(fi).zfill(2) + "_crop_3x_clahe.png"
    crop_clahe_path = os.path.join(DEBUG_DIR, clahe_name)
    cv2.imwrite(crop_clahe_path, gray_clahe)

    print("  Frame " + str(fi).rjust(2) + ": crop=" + str(crop_w) + "x" + str(crop_h) + "  bbox=" + str(p_bbox))
    print("    Saved: " + crop_name)
    print("           " + crop_up_name)

    # ---- OCR attempts ----
    if reader:
        # Attempt 1: standard (what pipeline does)
        scale = max(1, int(80 / max(crop_h, 1)))
        crop_std = cv2.resize(p_crop, (crop_w * scale, crop_h * scale), interpolation=cv2.INTER_CUBIC)
        r1 = reader.readtext(crop_std, allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                             batch_size=1, detail=1)
        text1 = " ".join(t for _,t,_ in r1) if r1 else ""
        conf1 = (sum(c for _,_,c in r1)/len(r1)*100) if r1 else 0.0
        print("    OCR-std  (scale=" + str(scale) + "x, " + str(crop_w*scale) + "x" + str(crop_h*scale) + "): '" + text1 + "'  conf=" + str(round(conf1,1)) + "%")

        # Attempt 2: 3x upscale, min_size=5
        r2 = reader.readtext(crop_up, allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                             batch_size=1, detail=1, min_size=5)
        text2 = " ".join(t for _,t,_ in r2) if r2 else ""
        conf2 = (sum(c for _,_,c in r2)/len(r2)*100) if r2 else 0.0
        print("    OCR-3x   (min_size=5, " + str(crop_w*3) + "x" + str(crop_h*3) + "): '" + text2 + "'  conf=" + str(round(conf2,1)) + "%")

        # Attempt 3: CLAHE grayscale, 3x, min_size=5
        r3 = reader.readtext(gray_clahe, allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                             batch_size=1, detail=1, min_size=5)
        text3 = " ".join(t for _,t,_ in r3) if r3 else ""
        conf3 = (sum(c for _,_,c in r3)/len(r3)*100) if r3 else 0.0
        print("    OCR-clahe (min_size=5, gray " + str(crop_w*3) + "x" + str(crop_h*3) + "): '" + text3 + "'  conf=" + str(round(conf3,1)) + "%")

        # Attempt 4: 5x upscale
        crop_5x = cv2.resize(p_crop, (crop_w*5, crop_h*5), interpolation=cv2.INTER_CUBIC)
        r4 = reader.readtext(crop_5x, allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                             batch_size=1, detail=1, min_size=3)
        text4 = " ".join(t for _,t,_ in r4) if r4 else ""
        conf4 = (sum(c for _,_,c in r4)/len(r4)*100) if r4 else 0.0
        crop_5x_name = "frame_" + str(fi).zfill(2) + "_crop_5x.png"
        cv2.imwrite(os.path.join(DEBUG_DIR, crop_5x_name), crop_5x)
        print("    OCR-5x   (min_size=3, " + str(crop_w*5) + "x" + str(crop_h*5) + "): '" + text4 + "'  conf=" + str(round(conf4,1)) + "%")
    print()

cap.release()
print("=" * 60)
print("All crops saved to: " + DEBUG_DIR)
print("Inspect PNG files to see if plate text is visually readable.")
print("=" * 60)
