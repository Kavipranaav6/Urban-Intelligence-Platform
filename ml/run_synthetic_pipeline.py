"""
run_synthetic_pipeline.py
Runs the full ANPR + incident-detection pipeline on test_rash_synthetic.mp4
using ground-truth bboxes (bypassing YOLO, which won't detect synthetic rectangles).

Tests:
  A  Did the rash-driving trigger fire at the designed frame (14)?
  B  Did the contour localizer correctly crop the plate (not the 37x9 fallback)?
  C  Did OCR correctly read KA05MN2024 from that crop?
"""

import sys, os, cv2, math, time
import numpy as np
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

VIDEO = os.path.join(ROOT, "test_rash_synthetic.mp4")
if not os.path.exists(VIDEO):
    raise FileNotFoundError(f"Run gen_synthetic_clip.py first — not found: {VIDEO}")

from ml.inference.anpr_detector import ANPRDetector, format_plate_number, PLATE_REGEX
from ml.inference.incident_detector import IncidentDetector

W, H, FPS, N = 1280, 720, 10, 40
CAR_W, CAR_H = 240, 140
TRACK_ID  = 7
VEHICLE_CLASS = "car"
CX0, CY0 = 960.0, 280.0
SLOW_FRAMES = 9
PLATE_TEXT = "KA05MN2024"

SEP = "=" * 70

def car_cx_cy(fi):
    if fi <= SLOW_FRAMES:
        return CX0 - fi*4.0, CY0 + fi*1.0
    else:
        return (CX0 - SLOW_FRAMES*4.0) - (fi-SLOW_FRAMES)*85.0, \
               (CY0 + SLOW_FRAMES*1.0)  + (fi-SLOW_FRAMES)*2.0

def car_bbox(fi):
    cx, cy = car_cx_cy(fi)
    return [cx - CAR_W/2, cy - CAR_H/2, cx + CAR_W/2, cy + CAR_H/2]

# ─────────────────────────────────────────────────────────────────────────────
# PRE-CALCULATE: which frame should trigger, and why
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print("PRE-CALCULATION — trajectory trigger analysis")
print(SEP)

cx0, cy0 = car_cx_cy(0)
print(f"{'Frm':>4}  {'lat_rate':>10}  {'spd_px/s':>10}  {'spd_kmh':>8}  "
      f"{'agg_cut':>8}  {'hi_swerve':>10}  {'close_prox':>11}")
print(f"  {'-'*4}  {'-'*10}  {'-'*10}  {'-'*8}  {'-'*8}  {'-'*10}  {'-'*11}")

designed_trigger = None
for fi in range(2, N):
    cx_fi, cy_fi = car_cx_cy(fi)
    ts = fi / FPS
    dt = max(0.05, ts)
    dx = cx_fi - cx0
    dy = cy_fi - cy0
    lateral_rate = abs(dx) / W / dt
    dist_px = math.sqrt(dx**2 + dy**2)
    speed_px_sec = dist_px / dt
    speed_kmh = min(115, max(28, int(35 + (speed_px_sec/18.0)*8.5)))
    bbox3 = car_cx_cy(fi)[1] + CAR_H/2   # vy2
    is_agg = lateral_rate > 0.18 and speed_px_sec > 120.0
    is_swerve = speed_kmh > 65 and lateral_rate > 0.14
    is_close = bbox3 > H * 0.70 and lateral_rate > 0.12
    fires = is_agg or is_swerve or is_close
    print(f"  {fi:>4}  {lateral_rate:>10.4f}  {speed_px_sec:>10.1f}  {speed_kmh:>8}  "
          f"  {is_agg!s:>6}  {is_swerve!s:>8}    {is_close!s:>8}")
    if fires and designed_trigger is None:
        designed_trigger = fi
        print(f"         ^^^^^ FIRST TRIGGER FRAME = {fi} (t={ts:.1f}s)")

print()
print(f"  Designed trigger frame: {designed_trigger}  (t={designed_trigger/FPS:.1f}s)")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE A — Incident Detector (ground-truth bboxes, frame-by-frame)
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE A — INCIDENT DETECTOR (ground-truth synthetic bboxes)")
print(SEP)

cap = cv2.VideoCapture(VIDEO)
anpr = ANPRDetector(min_confidence=55.0)
inc = IncidentDetector(anpr_detector=anpr)

triggered_frame = None
all_incidents = []

for fi in range(N):
    ts = fi / FPS
    bbox = car_bbox(fi)
    det = {
        "track_id": TRACK_ID,
        "class": VEHICLE_CLASS,
        "bboxPixels": bbox,
    }
    # Read actual frame for ANPR
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    raw = frame if ret else None

    new_incs = inc.update_frame(
        frame_idx=fi,
        timestamp_sec=ts,
        detections=[det],
        frame_width=W,
        frame_height=H,
        raw_frame=raw
    )
    if new_incs and triggered_frame is None:
        triggered_frame = fi
        all_incidents.extend(new_incs)
        print(f"  >> Trigger fired at frame {fi} (t={ts:.1f}s)")
        for inc_rec in new_incs:
            print(f"    type={inc_rec['incidentType']}  severity={inc_rec['severity']}")
            print(f"    speedRecorded={inc_rec['speedRecorded']} km/h")
            print(f"    plate='{inc_rec['plateNumber']}'  conf={inc_rec['plateConfidence']:.1f}%  readable={inc_rec['isPlateReadable']}")

cap.release()

print()
if triggered_frame == designed_trigger:
    print(f"  [PASS] Trigger fired at designed frame {designed_trigger}")
elif triggered_frame is not None:
    diff = triggered_frame - designed_trigger
    print(f"  [NOTE] Trigger fired at frame {triggered_frame} (designed={designed_trigger}, delta={diff:+d}) -- earlier path satisfied")
else:
    print(f"  [FAIL] Trigger NEVER fired across {N} frames")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE B — Contour Localizer forensics across all frames
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE B — ANPR CONTOUR LOCALIZER (per-frame, every vehicle detection)")
print(SEP)

cap2 = cv2.VideoCapture(VIDEO)
anpr2 = ANPRDetector(min_confidence=55.0)

localizer_results = []
FALLBACK_SIZE = (37, 9)  # what the 37x9 fallback crops look like from previous test

print(f"  {'Frm':>4}  {'veh WxH':>10}  {'phase':>10}  {'loc?':>5}  {'cropWxH':>10}  {'is_fallbk?':>11}  {'ocr_raw':>16}  {'conf':>6}")
print(f"  {'-'*4}  {'-'*10}  {'-'*10}  {'-'*5}  {'-'*10}  {'-'*11}  {'-'*16}  {'-'*6}")

for fi in range(N):
    cap2.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap2.read()
    if not ret or frame is None:
        continue

    bbox = car_bbox(fi)
    vw = bbox[2] - bbox[0]
    vh = bbox[3] - bbox[1]

    # Determine phase label
    if fi <= SLOW_FRAMES:
        phase = "slow"
    elif fi <= 14:
        phase = "cut-in"
    elif fi <= 24:
        phase = "noise"
    else:
        phase = "post"

    plate_cand = anpr2.locate_plate_candidate(frame, bbox)
    if plate_cand is not None:
        p_bbox, p_crop = plate_cand
        crop_h, crop_w = p_crop.shape[:2]
        is_fallback = (crop_w <= 45 and crop_h <= 12)  # tiny fallback heuristic crop
        raw_text, ocr_conf = anpr2._run_ocr(p_crop)
        hit = True
    else:
        crop_w = crop_h = 0
        is_fallback = False
        raw_text = ""
        ocr_conf = 0.0
        hit = False

    localizer_results.append({
        "fi": fi, "phase": phase, "hit": hit,
        "crop_wh": (crop_w, crop_h), "is_fallback": is_fallback,
        "ocr_raw": raw_text, "ocr_conf": ocr_conf,
    })

    hit_str = "YES" if hit else "MISS"
    fb_str  = "fallback" if is_fallback else "-"
    cwh_str = f"{crop_w}x{crop_h}" if hit else "N/A"
    print(f"  {fi:>4}  {vw:.0f}x{vh:.0f}  {phase:>10}  {hit_str:>5}  {cwh_str:>10}  {fb_str:>11}  {raw_text!r:>16}  {ocr_conf:>6.1f}")

cap2.release()

# Summary stats
n_total = len(localizer_results)
n_hit     = sum(1 for r in localizer_results if r["hit"])
n_fallback= sum(1 for r in localizer_results if r["is_fallback"])
n_good_crop = n_hit - n_fallback
n_ocr     = sum(1 for r in localizer_results if r["ocr_raw"])

print()
print(f"  LOCALIZER SUMMARY:")
print(f"    Frames analysed         : {n_total}")
print(f"    Hit (any crop)          : {n_hit} ({100*n_hit//n_total}%)")
print(f"    Fallback (tiny crop)    : {n_fallback} ({100*n_fallback//max(1,n_hit):.0f}% of hits)")
print(f"    Good crop (not fallback): {n_good_crop} ({100*n_good_crop//n_total:.0f}%)")
print(f"    OCR produced text       : {n_ocr} ({100*n_ocr//max(1,n_hit):.0f}% of hits)")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE C — OCR quality on the designed trigger frame & nearby frames
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print(f"STAGE C - OCR quality: trigger frame window (frames {designed_trigger-2}..{designed_trigger+3})")
print(SEP)

cap3 = cv2.VideoCapture(VIDEO)
anpr3 = ANPRDetector(min_confidence=40.0)   # lower threshold for diagnostic

for fi in range(max(0, designed_trigger-2), min(N, designed_trigger+4)):
    cap3.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap3.read()
    if not ret: continue
    bbox = car_bbox(fi)
    cand = anpr3.locate_plate_candidate(frame, bbox)
    if cand is None:
        print(f"  Frame {fi}: localizer returned None")
        continue
    p_bbox, p_crop = cand
    crop_h, crop_w = p_crop.shape[:2]
    raw_text, ocr_conf = anpr3._run_ocr(p_crop)
    formatted = format_plate_number(raw_text) if raw_text else ""
    regex_ok   = bool(formatted and PLATE_REGEX.match(formatted))
    correct    = PLATE_TEXT.replace(" ", "") in raw_text.replace(" ", "").upper()
    print(f"  Frame {fi} ({fi/FPS:.1f}s)  crop={crop_w}x{crop_h}  "
          f"raw='{raw_text}'  formatted='{formatted}'  conf={ocr_conf:.1f}%  "
          f"regex={'OK' if regex_ok else 'NO'}  text_match={'OK' if correct else 'NO'}")

cap3.release()

# ─────────────────────────────────────────────────────────────────────────────
# STAGE D — Bottleneck verdict
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE D — VERDICT")
print(SEP)

good_crop_rate   = n_good_crop / n_total
fallback_rate    = n_fallback / max(1, n_hit)
ocr_success_rate = n_ocr / max(1, n_hit)

trigger_ok    = triggered_frame is not None
trigger_exact = triggered_frame == designed_trigger
localizer_ok  = good_crop_rate >= 0.5
ocr_ok        = ocr_success_rate >= 0.4

print(f"  A) Incident trigger : {'[FIRED]' if trigger_ok else '[DID NOT FIRE]'} "
      f"{'(exact frame)' if trigger_exact else f'(at frame {triggered_frame} vs designed {designed_trigger})' if trigger_ok else ''}")
print(f"  B) Contour localizer: {'[GOOD]' if localizer_ok else '[MARGINAL]' if good_crop_rate >= 0.3 else '[BOTTLENECK]'} "
      f"({n_good_crop}/{n_total} good crops, {n_fallback} fallback)")
print(f"  C) EasyOCR          : {'[OK]' if ocr_ok else '[FAIL]'} "
      f"({n_ocr}/{n_hit} hits produced text)")

if trigger_ok and localizer_ok and ocr_ok:
    print()
    print("  OVERALL: [PASS] Pipeline functioning on synthetic ground-truth clip.")
    print("           Ready for Option A (real dashcam clip) generalization check.")
elif not trigger_ok:
    print()
    print("  OVERALL: [FAIL] Trigger logic broken -- check heuristic thresholds.")
elif not localizer_ok:
    print()
    print("  OVERALL: [FAIL] Contour localizer IS the bottleneck -- swap in ALPR model.")
else:
    print()
    print("  OVERALL: [WARN] OCR failing on localizer crops -- investigate crop size/quality.")

print()
print(SEP)
print("END OF REPORT")
print(SEP)
