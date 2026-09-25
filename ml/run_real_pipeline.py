"""
run_real_pipeline.py
Full ANPR + incident detection pipeline on a real dashcam clip.
Uses YOLOv8 + ByteTrack for real detection (no synthetic ground-truth shortcuts).

Usage:
  ml\\venv310\\Scripts\\python.exe ml\\run_real_pipeline.py [video_path]
  Default video: videos/driving.mp4

Reports:
  - All detections + track IDs found
  - Any rash-driving / hit-and-run incidents triggered
  - ANPR results for vehicles involved in incidents
  - Per-track plate readings across entire clip (best reading per track)
"""
import sys, os, cv2, time
import numpy as np
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

VIDEO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "videos", "driving.mp4")
if not os.path.exists(VIDEO):
    raise FileNotFoundError("Video not found: " + VIDEO)

from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector, format_plate_number, PLATE_REGEX
from ml.inference.incident_detector import IncidentDetector

SEP = "=" * 72

cap_probe = cv2.VideoCapture(VIDEO)
FPS = cap_probe.get(cv2.CAP_PROP_FPS)
W   = int(cap_probe.get(cv2.CAP_PROP_FRAME_WIDTH))
H   = int(cap_probe.get(cv2.CAP_PROP_FRAME_HEIGHT))
N   = int(cap_probe.get(cv2.CAP_PROP_FRAME_COUNT))
cap_probe.release()
DUR = N / FPS

print(SEP)
print("URBANSENSE-AI  -  Real Clip Pipeline")
print(SEP)
print("Video   : " + os.path.basename(VIDEO))
print("Size    : " + str(W) + "x" + str(H) + "  FPS=" + str(round(FPS,1)) + "  Frames=" + str(N) + "  Duration=" + str(round(DUR,1)) + "s")
print()

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1 — YOLO + ByteTrack: detect all vehicles frame-by-frame
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print("STAGE 1  YOLO + ByteTrack detection")
print(SEP)

detector = YOLODetector("yolov8n.pt")
print()

t0 = time.time()
all_frame_dets = detector.track_video(VIDEO, conf_threshold=0.25)
t1 = time.time()

total_dets = sum(len(d) for d in all_frame_dets)
print("Frames processed : " + str(len(all_frame_dets)))
print("Total detections : " + str(total_dets))
print("Time elapsed     : " + str(round(t1 - t0, 1)) + "s")

# Summarize unique tracks
track_summary = defaultdict(lambda: {"class": "?", "frame_count": 0, "frames": []})
for fi, dets in enumerate(all_frame_dets):
    for d in dets:
        tid = d.get("track_id", -1)
        cls = d.get("class", d.get("class_name", "?"))
        track_summary[tid]["class"] = cls
        track_summary[tid]["frame_count"] += 1
        track_summary[tid]["frames"].append(fi)

print()
print("Unique tracks found: " + str(len(track_summary)))
print()
print("  TID   Class          Frames  First  Last")
print("  ---   -----------    ------  -----  ----")
for tid in sorted(track_summary.keys()):
    t = track_summary[tid]
    frames = t["frames"]
    print("  " + str(tid).rjust(3) + "   " + t["class"].ljust(14) +
          str(t["frame_count"]).rjust(6) + "  " +
          str(frames[0]).rjust(5) + "  " + str(frames[-1]).rjust(4))

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2 — Incident Detector + ANPR (frame-by-frame, real detections)
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 2  Incident Detector + ANPR")
print(SEP)
print()

anpr = ANPRDetector(min_confidence=50.0)
inc  = IncidentDetector(anpr_detector=anpr)

cap2 = cv2.VideoCapture(VIDEO)
all_incidents = []
plate_best = defaultdict(lambda: {"text": "", "conf": 0.0, "frame": -1})  # best plate per track

for fi, dets in enumerate(all_frame_dets):
    ts = fi / FPS
    cap2.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, raw_frame = cap2.read()
    raw = raw_frame if ret else None

    # Try ANPR on detected vehicles (every frame for motorcycles, sampled for other vehicles)
    if raw is not None:
        for d in dets:
            tid = d.get("track_id", -1)
            cls = d.get("class", d.get("class_name", "?"))
            bbox = d.get("bbox") or d.get("bboxPixels", [0,0,0,0])
            vehicle_classes = {"car","truck","bus","motorcycle","auto","vehicle","van","suv","bicycle"}
            if any(vc in cls.lower() for vc in vehicle_classes):
                is_moto = "motorcycle" in cls.lower() or "bicycle" in cls.lower()
                should_run_ocr = is_moto or (fi % 3 == 0) or (plate_best[tid]["conf"] < 50.0 and fi % 2 == 0)
                if should_run_ocr:
                    cand = anpr.locate_plate_candidate(raw, bbox, vehicle_class=cls)
                    if cand is not None:
                        _, p_crop = cand
                        raw_txt, conf = anpr._run_ocr(p_crop)
                        if raw_txt and conf > plate_best[tid]["conf"]:
                            plate_best[tid] = {"text": raw_txt, "conf": conf, "frame": fi}

    new_incs = inc.update_frame(
        frame_idx=fi,
        timestamp_sec=ts,
        detections=dets,
        frame_width=W,
        frame_height=H,
        raw_frame=raw
    )
    if new_incs:
        all_incidents.extend(new_incs)
        for inc_rec in new_incs:
            t_str = str(int(ts//60)).zfill(2) + ":" + str(int(ts%60)).zfill(2)
            print("  [INCIDENT] frame=" + str(fi) + "  t=" + t_str +
                  "  type=" + inc_rec.get("incidentType","?") +
                  "  severity=" + inc_rec.get("severity","?") +
                  "  track=" + str(inc_rec.get("trackId","?")))
            print("    speed=" + str(inc_rec.get("speedRecorded","?")) + " km/h" +
                  "  plate='" + str(inc_rec.get("plateNumber","")) + "'" +
                  "  conf=" + str(round(inc_rec.get("plateConfidence",0),1)) + "%" +
                  "  readable=" + str(inc_rec.get("isPlateReadable",False)))

cap2.release()

if not all_incidents:
    print("  [INFO] No incidents triggered by the heuristic rules.")
    print("  This may be because:")
    print("    - The scooter motion does not cross lateral_rate > 0.18 + speed > 120 px/s")
    print("    - The frame-to-frame track history is too short for the trajectory check")
    print("    - YOLO missed the scooter in some frames, breaking track continuity")

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3 — Best plate per track (across all frames, not just incident moment)
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 3  Best plate reading per track (all frames)")
print(SEP)
print()
print("  TID   Class          BestOCR_raw         Conf%   Frame  Formatted         Regex")
print("  ---   -----------    ------------------  ------  -----  ----------------  -----")

vehicle_classes_set = {"car","truck","bus","motorcycle","auto","vehicle","van","suv","bicycle"}
for tid in sorted(track_summary.keys()):
    cls = track_summary[tid]["class"]
    if not any(vc in cls.lower() for vc in vehicle_classes_set):
        continue
    best = plate_best[tid]
    raw_txt = best["text"]
    conf    = best["conf"]
    frame   = best["frame"]
    formatted = format_plate_number(raw_txt) if raw_txt else ""
    regex_ok = bool(formatted and PLATE_REGEX.match(formatted))
    print("  " + str(tid).rjust(3) + "   " + cls.ljust(14) +
          repr(raw_txt).ljust(20) + "  " + str(round(conf,1)).rjust(6) + "  " +
          str(frame).rjust(5) + "  " + formatted.ljust(16) + "  " +
          ("OK" if regex_ok else "NO"))

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 4 — Trajectory forensics for motorcycle/scooter tracks specifically
# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print("STAGE 4  Trajectory forensics - motorcycle/scooter tracks")
print(SEP)
print()

import math
from collections import deque

moto_tracks = {tid: t for tid, t in track_summary.items()
               if "motorcycle" in t["class"].lower() or "bicycle" in t["class"].lower()}

if not moto_tracks:
    print("  No motorcycle/scooter tracks found by YOLO.")
else:
    for tid in sorted(moto_tracks.keys()):
        info = moto_tracks[tid]
        print("  Track " + str(tid) + " (" + info["class"] + ")  " + str(info["frame_count"]) + " frames")

        # Replay trajectory and compute lateral_rate + speed at each frame
        traj = deque(maxlen=40)
        prev_cx, prev_cy = None, None

        print("    " + "Frm".rjust(4) + "  " + "cx".rjust(6) + "  " + "cy".rjust(6) +
              "  " + "lat_rate".rjust(10) + "  " + "spd_px/s".rjust(10) +
              "  " + "agg_cut".rjust(8) + "  " + "hi_swerve".rjust(10))

        for fi in info["frames"]:
            dets = all_frame_dets[fi]
            det = next((d for d in dets if d.get("track_id") == tid), None)
            if det is None:
                continue
            bbox = det.get("bbox") or det.get("bboxPixels", [0,0,0,0])
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            ts = fi / FPS
            traj.append((cx, cy, ts))

            if len(traj) >= 3:
                cx0, cy0, ts0 = traj[0]
                cxN, cyN, tsN = traj[-1]
                dt = max(0.05, tsN - ts0)
                dx = cxN - cx0
                dy = cyN - cy0
                lateral_rate = abs(dx) / W / dt
                dist_px = math.sqrt(dx**2 + dy**2)
                speed_px_sec = dist_px / dt
                speed_kmh = min(115, max(28, int(35 + (speed_px_sec/18.0)*8.5)))
                is_agg = lateral_rate > 0.18 and speed_px_sec > 120.0
                is_swerve = speed_kmh > 65 and lateral_rate > 0.14
                if is_agg or is_swerve or lateral_rate > 0.10:
                    print("    " + str(fi).rjust(4) + "  " +
                          str(round(cx,1)).rjust(6) + "  " + str(round(cy,1)).rjust(6) +
                          "  " + str(round(lateral_rate,4)).rjust(10) +
                          "  " + str(round(speed_px_sec,1)).rjust(10) +
                          "  " + str(is_agg).rjust(8) +
                          "  " + str(is_swerve).rjust(10))
        print()

# ─────────────────────────────────────────────────────────────────────────────
# FINAL VERDICT
# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print("FINAL VERDICT")
print(SEP)
print("  Incidents triggered : " + str(len(all_incidents)))
for inc_rec in all_incidents:
    print("    - " + inc_rec.get("incidentType","?") + " @ track " +
          str(inc_rec.get("trackId","?")) + "  plate='" +
          str(inc_rec.get("plateNumber","")) + "'  readable=" +
          str(inc_rec.get("isPlateReadable",False)))
print()
print("  Per-track best plates:")
for tid in sorted(track_summary.keys()):
    cls = track_summary[tid]["class"]
    if not any(vc in cls.lower() for vc in vehicle_classes_set):
        continue
    best = plate_best[tid]
    if best["conf"] > 40:
        formatted = format_plate_number(best["text"]) if best["text"] else ""
        regex_ok = bool(formatted and PLATE_REGEX.match(formatted))
        print("    Track " + str(tid) + " (" + cls + ")  ->  '" + formatted +
              "'  " + str(round(best["conf"],1)) + "%  regex=" + ("OK" if regex_ok else "NO"))
print()
print(SEP)
print("END")
print(SEP)
