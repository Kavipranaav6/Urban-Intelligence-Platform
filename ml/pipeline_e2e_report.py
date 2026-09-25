"""
pipeline_e2e_report.py
Full end-to-end pipeline diagnostic on test_traffic.mp4.
Runs: YOLO+ByteTrack -> IncidentDetector -> ANPRDetector (contour + OCR)
Reports at each stage with per-frame forensics.
"""

import sys, os, cv2, time, math, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

VIDEO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "test_traffic.mp4")

SEP = "=" * 70

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 0: Video properties
# ─────────────────────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(VIDEO)
fps      = cap.get(cv2.CAP_PROP_FPS) or 10.0
n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
W        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H        = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
cap.release()

print(SEP)
print("STAGE 0 — VIDEO PROPERTIES")
print(SEP)
print(f"  File      : {VIDEO}")
print(f"  Frames    : {n_frames}  |  FPS: {fps}  |  Duration: {n_frames/fps:.2f}s")
print(f"  Resolution: {W} x {H}")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: YOLO + ByteTrack on ALL frames
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 1 — YOLO + BYTETRACK (every frame)")
print(SEP)

from ml.inference.detector import YOLODetector
det = YOLODetector()
t0 = time.time()
per_frame = det.track_video(VIDEO, conf_threshold=0.25)
elapsed = time.time() - t0

print(f"  Tracker returned detections for {len(per_frame)} frames in {elapsed:.1f}s")
print()
print(f"  {'Frm':>4}  {'t(s)':>5}  {'#dets':>5}  TIDs")
all_tids_seen = set()
for fi, dets in enumerate(per_frame):
    ts = fi / fps
    tids = sorted(set(d.get("track_id", -1) for d in dets if d.get("track_id", -1) >= 0))
    all_tids_seen.update(tids)
    classes_str = ", ".join(f"{d['class']}#{d.get('track_id','?')}" for d in dets)
    print(f"  {fi:>4}  {ts:>5.2f}  {len(dets):>5}  [{classes_str}]")

print()
print(f"  Unique track IDs seen across clip: {sorted(all_tids_seen)}")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: IncidentDetector — frame-by-frame trigger evaluation
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 2 — INCIDENT DETECTOR (rash-driving / hit-and-run trigger logic)")
print(SEP)

from ml.inference.anpr_detector import ANPRDetector
from ml.inference.incident_detector import IncidentDetector, interpolate_gps_location

anpr = ANPRDetector(min_confidence=55.0)   # slightly lower threshold for demo clip
inc_det = IncidentDetector(anpr_detector=anpr)

cap2 = cv2.VideoCapture(VIDEO)
incident_frames = {}   # frame_idx -> list of incidents triggered that frame

for fi, dets in enumerate(per_frame):
    ts = fi / fps
    cap2.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap2.read()
    raw = frame if ret else None

    new_incidents = inc_det.update_frame(
        frame_idx=fi,
        timestamp_sec=ts,
        detections=dets,
        frame_width=W,
        frame_height=H,
        raw_frame=raw
    )
    if new_incidents:
        incident_frames[fi] = new_incidents

cap2.release()

print(f"  Total incidents triggered: {len(inc_det.get_all_incidents())}")
print(f"  Frames that produced new trigger: {sorted(incident_frames.keys())}")
print()

all_incidents = inc_det.get_all_incidents()
for inc in all_incidents:
    print(f"  ▶ [{inc['incidentType']}] id={inc['id']}  trackId={inc['trackId']}")
    print(f"    severity={inc['severity']}  speed={inc['speedRecorded']} km/h")
    print(f"    timestamp={inc['timestamp']}  loc={inc['locationName']}")
    print(f"    plate='{inc['plateNumber']}'  conf={inc['plateConfidence']:.1f}%  readable={inc['isPlateReadable']}")
    print(f"    trajectorySummary={inc['trajectorySummary']}")
    print()

if not all_incidents:
    print("  ⚠ No incidents triggered — analysing why:")
    for tid in sorted(all_tids_seen):
        traj = inc_det.track_trajectories.get(tid)
        if traj is None:
            print(f"    tid={tid}: not a vehicle class (likely person/bicycle)")
            continue
        if len(traj) < 3:
            print(f"    tid={tid}: only {len(traj)} trajectory points — too few to evaluate")
            continue
        p_first = traj[0]
        p_latest = traj[-1]
        dt = max(0.05, p_latest[1] - p_first[1])
        dx = p_latest[2] - p_first[2]
        dy = p_latest[3] - p_first[3]
        norm_dx = abs(dx) / W
        lateral_rate = norm_dx / dt
        dist_px = math.sqrt(dx**2 + dy**2)
        speed_px_sec = dist_px / dt
        speed_kmh = min(115, max(28, int(35 + (speed_px_sec / 18.0) * 8.5)))
        is_aggressive_cut = lateral_rate > 0.18 and speed_px_sec > 120.0
        is_high_speed_swerve = speed_kmh > 65 and lateral_rate > 0.14
        is_close_proximity = traj[-1][5] > H * 0.70 and lateral_rate > 0.12  # h > 70% frame
        print(f"    tid={tid} ({len(traj)} pts): lateral_rate={lateral_rate:.3f}  speed_px/s={speed_px_sec:.1f}  "
              f"speed_kmh≈{speed_kmh}  aggressive_cut={is_aggressive_cut}  "
              f"high_speed_swerve={is_high_speed_swerve}  close_prox={is_close_proximity}")
        p_latest_box = traj[-1][6]
        print(f"      last bbox={[round(x,1) for x in p_latest_box]}  "
              f"box_h={p_latest_box[3]-p_latest_box[1]:.1f}px ({(p_latest_box[3]-p_latest_box[1])/H*100:.1f}% of frame H)")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3: ANPR Localizer Forensics — for every vehicle in every frame
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 3 — ANPR CONTOUR LOCALIZER + OCR FORENSICS (all vehicle tracks)")
print(SEP)

VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle", "auto", "van", "suv"}

cap3 = cv2.VideoCapture(VIDEO)
anpr_fresh = ANPRDetector(min_confidence=55.0)

localizer_results = []   # list of dicts with full forensic data

for fi, dets in enumerate(per_frame):
    ts = fi / fps
    cap3.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap3.read()
    if not ret or frame is None:
        continue

    for det in dets:
        cls = det.get("class", "")
        if cls not in VEHICLE_CLASSES:
            continue
        tid = det.get("track_id", -1)
        bbox = det.get("bboxPixels", [0,0,0,0])
        vw = bbox[2] - bbox[0]
        vh = bbox[3] - bbox[1]

        # Contour localizer
        plate_cand = anpr_fresh.locate_plate_candidate(frame, bbox)
        if plate_cand is not None:
            p_bbox, p_crop = plate_cand
            localizer_hit = True
            crop_h, crop_w = p_crop.shape[:2]

            # OCR on what the localizer produced
            raw_text, ocr_conf = anpr_fresh._run_ocr(p_crop)
        else:
            localizer_hit = False
            p_bbox = None
            crop_h = crop_w = 0
            raw_text = ""
            ocr_conf = 0.0

        localizer_results.append({
            "frame": fi,
            "ts": ts,
            "tid": tid,
            "class": cls,
            "vehicle_bbox": [round(x,1) for x in bbox],
            "vehicle_wh": (round(vw,1), round(vh,1)),
            "localizer_hit": localizer_hit,
            "plate_bbox": [round(x,1) for x in p_bbox] if p_bbox else None,
            "crop_wh": (crop_w, crop_h),
            "ocr_raw": raw_text,
            "ocr_conf": round(ocr_conf, 1),
        })

cap3.release()

print(f"  {'Frm':>4}  {'t':>4}  {'tid':>4}  {'cls':>10}  {'veh WxH':>12}  {'loc?':>5}  {'crop WxH':>10}  {'OCR output':>16}  {'conf%':>6}")
print(f"  {'-'*4}  {'-'*4}  {'-'*4}  {'-'*10}  {'-'*12}  {'-'*5}  {'-'*10}  {'-'*16}  {'-'*6}")

localizer_hits = 0
localizer_misses = 0
successful_ocr = 0

for r in localizer_results:
    hit_str = "YES" if r["localizer_hit"] else "MISS"
    if r["localizer_hit"]:
        localizer_hits += 1
        if r["ocr_raw"]:
            successful_ocr += 1
    else:
        localizer_misses += 1
    vwh = f"{r['vehicle_wh'][0]}x{r['vehicle_wh'][1]}"
    cwh = f"{r['crop_wh'][0]}x{r['crop_wh'][1]}" if r["localizer_hit"] else "N/A"
    print(f"  {r['frame']:>4}  {r['ts']:>4.1f}  {r['tid']:>4}  {r['class']:>10}  "
          f"{vwh:>12}  {hit_str:>5}  {cwh:>10}  {r['ocr_raw']!r:>16}  {r['ocr_conf']:>6.1f}")

print()
print(f"  SUMMARY:")
print(f"    Vehicle detections analysed : {len(localizer_results)}")
print(f"    Localizer HIT               : {localizer_hits} ({100*localizer_hits/max(1,len(localizer_results)):.0f}%)")
print(f"    Localizer MISS              : {localizer_misses} ({100*localizer_misses/max(1,len(localizer_results)):.0f}%)")
print(f"    OCR produced text           : {successful_ocr} ({100*successful_ocr/max(1,localizer_hits):.0f}% of hits)")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 4: Bottleneck verdict
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 4 — BOTTLENECK VERDICT")
print(SEP)

miss_rate = localizer_misses / max(1, len(localizer_results))
ocr_success_on_hit = successful_ocr / max(1, localizer_hits) if localizer_hits > 0 else 0.0

print(f"  Localizer miss rate : {miss_rate*100:.0f}%")
print(f"  OCR success on hits : {ocr_success_on_hit*100:.0f}%")
print()

if miss_rate >= 0.5:
    print("  VERDICT: ⚠ CONTOUR LOCALIZER IS THE BOTTLENECK")
    print("    > Miss rate >= 50%. The contour+aspect-ratio approach cannot reliably")
    print("    > find plate regions in this clip. The pretrained Babblu2821/alpr-plate-detector")
    print("    > model should be evaluated as a replacement.")
elif miss_rate >= 0.25:
    print("  VERDICT: ⚠ LOCALIZER IS MARGINAL (25–49% miss rate)")
    print("    > Contour localizer works on larger vehicles but misses small/distant ones.")
    print("    > Consider ALPR model replacement for production use.")
elif ocr_success_on_hit < 0.4 and localizer_hits > 0:
    print("  VERDICT: OCR IS THE BOTTLENECK (localizer finds plate, but OCR fails on crop quality)")
    print("    > Crop quality / resolution is likely insufficient for reliable OCR.")
    print("    > Consider: higher-res source, pre-processing (CLAHE, upscale), or ALPR model.")
else:
    print("  VERDICT: ✅ PIPELINE IS FUNCTIONING")
    print("    > Localizer and OCR are both working within acceptable margins.")
    print("    > No swap needed based on this clip.")

print()
print(SEP)
print("END OF REPORT")
print(SEP)
