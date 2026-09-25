"""
benchmark_alpr_vs_contour.py
Side-by-side: Babblu2821/alpr-plate-detector vs contour localizer on driving.mp4
"""

import os
import sys
import cv2
import torch
import warnings

# Offline mode flags MUST be set before importing ultralytics
os.environ["ULTRALYTICS_HUB_OFFLINE"] = "1"
os.environ["YOLO_OFFLINE"] = "True"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
warnings.filterwarnings("ignore")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ultralytics import YOLO
from collections import defaultdict
from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector, format_plate_number, PLATE_REGEX

VIDEO = os.path.join(ROOT, "videos", "driving.mp4")
OUT_DIR = os.path.join(ROOT, "ml", "debug_crops", "alpr_benchmark")
os.makedirs(OUT_DIR, exist_ok=True)

ALPR_WEIGHTS = os.path.join(
    os.path.expanduser("~"),
    ".cache", "huggingface", "hub",
    "models--Babblu2821--alpr-plate-detector",
    "snapshots", "4ae32c182f083f1a60c3a8c1a19ad82b2674eea3",
    "best.pt"
)

print("Loading pretrained ALPR model...")
alpr_model = YOLO(ALPR_WEIGHTS)
alpr_device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"ALPR ready on {alpr_device}  classes={alpr_model.names}")

print("Running ByteTrack on driving.mp4...")
vehicle_detector = YOLODetector("yolov8n.pt")
all_dets = vehicle_detector.track_video(VIDEO, conf_threshold=0.25)
print(f"ByteTrack done: {len(all_dets)} frames")

anpr = ANPRDetector(min_confidence=30.0)

RC = defaultdict(lambda: {"raw": "", "formatted": "", "conf": 0.0, "regex_ok": False, "w": 0, "h": 0, "frame": -1, "det_conf": 0.0})
RA = defaultdict(lambda: {"raw": "", "formatted": "", "conf": 0.0, "regex_ok": False, "w": 0, "h": 0, "frame": -1, "det_conf": 0.0})
TC = {}  # track_id -> class

MOTOS = {8, 39, 40, 66, 93, 143}
CARS  = {2, 6, 35, 44, 366, 418}
TARGETS = MOTOS | CARS

cap = cv2.VideoCapture(VIDEO)
frames_run = 0

for fi, dets in enumerate(all_dets):
    if not dets:
        continue
    if not any(d.get("track_id") in TARGETS for d in dets):
        continue

    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        continue

    frames_run += 1
    fh, fw = frame.shape[:2]

    for d in dets:
        tid = d.get("track_id", -1)
        if tid not in TARGETS:
            continue
        cls = d.get("class", d.get("class_name", "car")).lower()
        TC[tid] = cls
        bbox = d.get("bbox") or d.get("bboxPixels", [0, 0, 0, 0])
        vx1, vy1, vx2, vy2 = [max(0, int(v)) for v in bbox]
        vx2, vy2 = min(fw, vx2), min(fh, vy2)
        vw, vh = vx2 - vx1, vy2 - vy1
        if vw < 30 or vh < 25:
            continue

        # ── CONTOUR LOCALIZER ──
        try:
            cand = anpr.locate_plate_candidate(frame, bbox, vehicle_class=cls)
            if cand is not None:
                _, crop = cand
                cw, ch = crop.shape[1], crop.shape[0]
                raw, conf = anpr._run_ocr(crop)
                if raw and conf > RC[tid]["conf"]:
                    fmt = format_plate_number(raw)
                    RC[tid] = {"raw": raw, "formatted": fmt, "conf": conf,
                               "regex_ok": bool(fmt and PLATE_REGEX.match(fmt)),
                               "w": cw, "h": ch, "frame": fi, "det_conf": 100.0}
                    cv2.imwrite(os.path.join(OUT_DIR, f"contour_t{tid}_f{fi}.png"), crop)
        except Exception as e:
            print(f"  [Contour] TID={tid} fi={fi}: {e}")

        # ── PRETRAINED ALPR ──
        try:
            mx1 = max(0, int(vx1 - vw*0.05)); my1 = max(0, int(vy1 - vh*0.05))
            mx2 = min(fw, int(vx2 + vw*0.05)); my2 = min(fh, int(vy2 + vh*0.10))
            vcrop = frame[my1:my2, mx1:mx2]
            if vcrop.size == 0:
                continue

            res = alpr_model.predict(source=vcrop, conf=0.10, verbose=False, device=alpr_device)
            if res and len(res[0].boxes) > 0:
                bb = max(res[0].boxes, key=lambda b: float(b.conf[0].item()))
                det_c = float(bb.conf[0].item()) * 100.0
                bx1, by1, bx2, by2 = [int(v) for v in bb.xyxy[0].tolist()]
                bx1, by1 = max(0, bx1), max(0, by1)
                bx2, by2 = min(vcrop.shape[1], bx2), min(vcrop.shape[0], by2)
                pc = vcrop[by1:by2, bx1:bx2]
                if pc.size > 0 and pc.shape[0] >= 5 and pc.shape[1] >= 10:
                    pw, ph = pc.shape[1], pc.shape[0]
                    raw_a, conf_a = anpr._run_ocr(pc)
                    if det_c > RA[tid]["det_conf"] or (raw_a and conf_a > RA[tid]["conf"]):
                        fmt_a = format_plate_number(raw_a) if raw_a else ""
                        RA[tid] = {"raw": raw_a, "formatted": fmt_a, "conf": conf_a,
                                   "regex_ok": bool(fmt_a and PLATE_REGEX.match(fmt_a)),
                                   "w": pw, "h": ph, "frame": fi, "det_conf": det_c}
                        cv2.imwrite(os.path.join(OUT_DIR, f"alpr_t{tid}_f{fi}.png"), pc)
        except Exception as e:
            print(f"  [ALPR] TID={tid} fi={fi}: {e}")

cap.release()
print(f"Done. Frames run: {frames_run}")

# ════════════════════════════════════════════════════════════════
# REPORT
# ════════════════════════════════════════════════════════════════
S = "=" * 100
print()
print(S)
print("BENCHMARK: Babblu2821/alpr-plate-detector vs Contour Localizer on driving.mp4")
print(S)
print()
print(f"{'TID':<5} {'TYPE':<11} {'METHOD':<10} {'CROP':<10} {'RAW OCR':<18} {'FORMATTED':<18} {'OCR%':<8} {'REGEX':<5} {'DET%'}")
print("-"*100)

for tid in sorted(TARGETS):
    cls = TC.get(tid, "?")
    is_m = "motorcycle" in cls or "bicycle" in cls
    T = "MOTORCYCLE" if is_m else "CAR"

    rc = RC[tid]; ra = RA[tid]
    cc = f"{rc['w']}x{rc['h']}" if rc["w"] else "NONE"
    ca = f"{ra['w']}x{ra['h']}" if ra["w"] else "NONE"

    print(f"{tid:<5} {T:<11} {'Contour':<10} {cc:<10} {repr(rc['raw'][:16]):<18} {rc['formatted'][:17]:<18} {rc['conf']:<8.1f} {'YES' if rc['regex_ok'] else 'NO':<5} --")
    print(f"{'':5} {'':11} {'ALPR':<10} {ca:<10} {repr(ra['raw'][:16]):<18} {ra['formatted'][:17]:<18} {ra['conf']:<8.1f} {'YES' if ra['regex_ok'] else 'NO':<5} {ra['det_conf']:.1f}%")
    print("." * 100)

print()
print("MOTORCYCLE LOCALIZATION (tracks 8,39,40,66,93,143):")
print("-"*70)
a_found = c_found = 0
for mtid in [8, 39, 40, 66, 93, 143]:
    rc = RC[mtid]; ra = RA[mtid]
    c_hit = rc["w"] > 0; a_hit = ra["w"] > 0
    if c_hit: c_found += 1
    if a_hit: a_found += 1
    print(f"  Track {mtid:3d}: Contour={'FOUND' if c_hit else 'MISS '} (ocr={rc['conf']:.1f}% '{rc['raw']}')  |  ALPR={'FOUND' if a_hit else 'MISS '} (det={ra['det_conf']:.1f}% ocr={ra['conf']:.1f}% '{ra['raw']}')")
print(f"\n  Contour found: {c_found}/6  |  ALPR found: {a_found}/6")

print()
print("CAR PLATE COMPARISON (Ground truth KA 05 NL 9156, tracks 44/366/418):")
print("-"*70)
for ctid in [44, 366, 418]:
    rc = RC[ctid]; ra = RA[ctid]
    print(f"  Track {ctid}: Contour='{rc['formatted']}'  {rc['conf']:.1f}% {'OK' if rc['regex_ok'] else 'NO'}  crop={rc['w']}x{rc['h']}")
    print(f"  Track {ctid}: ALPR   ='{ra['formatted']}'  {ra['conf']:.1f}% {'OK' if ra['regex_ok'] else 'NO'}  crop={ra['w']}x{ra['h']}  det={ra['det_conf']:.1f}%")
print()
print(S)
print("BENCHMARK COMPLETE")
print(S)
