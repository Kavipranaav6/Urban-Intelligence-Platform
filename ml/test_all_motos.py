import os
import sys
import re
import cv2
import easyocr
import warnings
os.environ["ULTRALYTICS_HUB_OFFLINE"] = "1"
os.environ["YOLO_OFFLINE"] = "True"
warnings.filterwarnings("ignore")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ultralytics import YOLO
from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import format_plate_number, PLATE_REGEX

weights = os.path.join(
    os.path.expanduser("~"),
    ".cache", "huggingface", "hub",
    "models--Babblu2821--alpr-plate-detector",
    "snapshots", "4ae32c182f083f1a60c3a8c1a19ad82b2674eea3",
    "best.pt"
)
alpr = YOLO(weights)
reader = easyocr.Reader(['en'], gpu=True)
vd = YOLODetector('yolov8n.pt')
VIDEO = os.path.join(ROOT, "videos", "driving.mp4")
dets = vd.track_video(VIDEO, conf_threshold=0.25)

MOTOS = {8, 39, 40, 66, 93, 143}
cap = cv2.VideoCapture(VIDEO)

print("Testing all motorcycle frames with two-row OCR...")
hits = []
for fi, frame_dets in enumerate(dets):
    for d in frame_dets:
        tid = d.get('track_id', -1)
        if tid in MOTOS:
            cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
            ret, frame = cap.read()
            if not ret:
                continue
            bbox = d.get('bbox') or d.get('bboxPixels', [0, 0, 0, 0])
            if not bbox or len(bbox) < 4:
                continue
            x1, y1, x2, y2 = [int(v) for v in bbox]
            vcrop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
            if vcrop.size == 0:
                continue
            
            res = alpr.predict(source=vcrop, conf=0.15, verbose=False)
            if res and len(res[0].boxes) > 0:
                bb = max(res[0].boxes, key=lambda b: float(b.conf[0].item()))
                bx1, by1, bx2, by2 = [int(v) for v in bb.xyxy[0].tolist()]
                pc = vcrop[max(0, by1):min(vcrop.shape[0], by2), max(0, bx1):min(vcrop.shape[1], bx2)]
                if pc.size == 0:
                    continue
                ph, pw = pc.shape[:2]
                ar = pw / max(1, ph)
                
                # Single-pass
                r_single = reader.readtext(pc, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
                s_txt = ' '.join(r[1] for r in r_single)
                
                # Two-row if AR < 2.5
                c_txt = ""
                if ar < 2.5 and ph >= 15 and pw >= 20:
                    top = pc[0:int(ph*0.55), :]
                    bot = pc[int(ph*0.45):ph, :]
                    stop = cv2.resize(top, (top.shape[1]*3, top.shape[0]*3), interpolation=cv2.INTER_CUBIC)
                    sbot = cv2.resize(bot, (bot.shape[1]*3, bot.shape[0]*3), interpolation=cv2.INTER_CUBIC)
                    rt = reader.readtext(stop, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
                    rb = reader.readtext(sbot, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
                    tt = ' '.join(r[1] for r in rt)
                    tb = ' '.join(r[1] for r in rb)
                    c_txt = f"{tt} {tb}".strip()
                
                if s_txt or c_txt:
                    print(f"TID {tid:3d} fi={fi:3d} ({pw}x{ph}, AR={ar:.2f}) | Single: '{s_txt}' | TwoRow: '{c_txt}'")
                    hits.append((tid, fi, s_txt, c_txt))

cap.release()
print(f"Total frames with any text hit: {len(hits)}")
