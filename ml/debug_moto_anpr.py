"""
debug_moto_anpr.py
Targeted ANPR debug for motorcycle tracks in driving.mp4.
Saves annotated frames + plate crop attempts for all moto tracks.
Ground truth plate: KA 01 JV 3919

Run with: ml\venv310\Scripts\python.exe ml\debug_moto_anpr.py
"""
import sys, os, cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector, _get_ocr_reader

VIDEO = os.path.join(ROOT, "videos", "driving.mp4")
OUT   = os.path.join(ROOT, "ml", "debug_crops", "moto_anpr")
os.makedirs(OUT, exist_ok=True)

GROUND_TRUTH = "KA01JV3919"

cap_probe = cv2.VideoCapture(VIDEO)
FPS = cap_probe.get(cv2.CAP_PROP_FPS)
W   = int(cap_probe.get(cv2.CAP_PROP_FRAME_WIDTH))
H   = int(cap_probe.get(cv2.CAP_PROP_FRAME_HEIGHT))
N   = int(cap_probe.get(cv2.CAP_PROP_FRAME_COUNT))
cap_probe.release()

print("=" * 70)
print("MOTORCYCLE ANPR DEBUG  --  GT: " + GROUND_TRUTH)
print("=" * 70)
print("Video: " + str(W) + "x" + str(H) + "  FPS=" + str(FPS) + "  N=" + str(N))
print()

# Step 1: Re-run tracker (fast, reuses cached model)
detector = YOLODetector("yolov8n.pt")
print("Running ByteTrack...")
all_dets = detector.track_video(VIDEO, conf_threshold=0.25)
print("Done.")
print()

# Collect motorcycle tracks
moto_tracks = {}
for fi, dets in enumerate(all_dets):
    for d in dets:
        cls = d.get("class", d.get("class_name", ""))
        if "motorcycle" in cls.lower() or "bicycle" in cls.lower():
            tid = d.get("track_id", -1)
            if tid not in moto_tracks:
                moto_tracks[tid] = []
            moto_tracks[tid].append((fi, d))

print("Motorcycle tracks: " + str(list(moto_tracks.keys())))
print()

reader = _get_ocr_reader()
anpr   = ANPRDetector(min_confidence=40.0)

cap = cv2.VideoCapture(VIDEO)

for tid in sorted(moto_tracks.keys()):
    entries = moto_tracks[tid]
    print("-" * 60)
    print("Track " + str(tid) + "  (" + str(len(entries)) + " frames, fi=" +
          str(entries[0][0]) + ".." + str(entries[-1][0]) + ")")

    best_text = ""
    best_conf = 0.0
    best_fi   = -1

    for fi, det in entries:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ret, frame = cap.read()
        if not ret:
            continue

        bbox = det.get("bbox") or det.get("bboxPixels", [0,0,0,0])
        bx1, by1, bx2, by2 = [max(0, int(v)) for v in bbox]
        bx2 = min(W-1, bx2); by2 = min(H-1, by2)
        vw = bx2 - bx1; vh = by2 - by1

        # Save annotated frame (first + every 5th)
        if fi == entries[0][0] or fi % 5 == 0:
            vis = frame.copy()
            cv2.rectangle(vis, (bx1, by1), (bx2, by2), (0, 255, 0), 2)
            cv2.putText(vis, "TID=" + str(tid), (bx1, max(0, by1-5)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)
            fname = "track" + str(tid).zfill(3) + "_f" + str(fi).zfill(4) + "_full.jpg"
            cv2.imwrite(os.path.join(OUT, fname), vis)

        # Try 4 different ROI strategies for motorcycle plate
        strategies = [
            # (name, y_start_pct, y_end_pct, x_start_pct, x_end_pct)
            ("std",       0.35, 1.05, 0.10, 0.90),  # current localizer ROI
            ("bottom20",  0.80, 1.10, 0.05, 0.95),  # just bottom 20%
            ("bottom30",  0.70, 1.10, 0.05, 0.95),  # bottom 30%
            ("full_bbox", 0.00, 1.10, 0.00, 1.00),  # entire vehicle bbox
        ]

        for sname, y0p, y1p, x0p, x1p in strategies:
            sx1 = max(0, int(bx1 + vw * x0p))
            sx2 = min(W-1, int(bx1 + vw * x1p))
            sy1 = max(0, int(by1 + vh * y0p))
            sy2 = min(H-1, int(by1 + vh * y1p))

            roi = frame[sy1:sy2, sx1:sx2]
            if roi.size == 0 or roi.shape[0] < 5 or roi.shape[1] < 10:
                continue

            if reader:
                # Upscale to at least 80px height for OCR
                rh, rw = roi.shape[:2]
                scale = max(1, int(80 / max(rh, 1)))
                if scale > 1:
                    roi_up = cv2.resize(roi, (rw*scale, rh*scale), interpolation=cv2.INTER_CUBIC)
                else:
                    roi_up = roi

                try:
                    results = reader.readtext(
                        roi_up,
                        allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
                        batch_size=1, detail=1, min_size=5
                    )
                except Exception:
                    results = []

                if results:
                    text = " ".join(t for _,t,_ in results)
                    conf = sum(c for _,_,c in results) / len(results) * 100.0
                    gt_match = GROUND_TRUTH.replace(" ","") in text.replace(" ","").upper()
                    if conf > best_conf or gt_match:
                        best_text = text
                        best_conf = conf
                        best_fi   = fi

                    if results and (conf > 40 or gt_match):
                        print("  fi=" + str(fi).rjust(4) +
                              "  bbox=" + str(vw) + "x" + str(vh) +
                              "  [" + sname + "] roi=" + str(sx2-sx1) + "x" + str(sy2-sy1) +
                              "  ->'" + text + "'  " + str(round(conf,1)) + "%" +
                              ("  *** GT MATCH ***" if gt_match else ""))
                        # Save that crop
                        cname = "track" + str(tid).zfill(3) + "_f" + str(fi).zfill(4) + "_" + sname + ".png"
                        cv2.imwrite(os.path.join(OUT, cname), roi_up)

    print("  BEST: '" + best_text + "'  " + str(round(best_conf,1)) + "%  @ frame " + str(best_fi))
    print()

cap.release()
print("=" * 70)
print("Done. Images in: " + OUT)
print("=" * 70)
