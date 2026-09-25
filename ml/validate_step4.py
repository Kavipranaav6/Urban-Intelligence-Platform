"""
STEP 4 - Final Validation: Raw hazard inference output on actual recorded test video.
Reports each detected hazard: class, confidence, bbox, severity.
"""
import cv2
from ml.inference.hazard_detector import HazardDetector
from ml.inference.hazard_detector import normalize_hazard_class

VIDEO = r"C:\Users\Kavipranaav LM\Downloads\pothole.mp4"

hd = HazardDetector()
hazard_tracker = hd.create_tracker(bus_id="BUS-103")

print("=" * 68)
print("  UrbanSense AI - Final Hazard Validation (STEP 4)")
print("=" * 68)
print(f"  is_available   : {hd.is_available}")
print(f"  models loaded  : {len(hd.models)}")
print(f"  conf_threshold : {hd.conf_threshold}")
print(f"  roi            : {hd.roi}")
for i, m in enumerate(hd.models):
    print(f"  model[{i}] classes: {list(m.names.values())}")
print("=" * 68)

cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"  video: {w}x{h}, FPS={fps}, frames={total}")
print("=" * 68)

f_idx = 0
raw_incidents = []

while cap.isOpened() and f_idx < 180:
    ret, frame = cap.read()
    if not ret:
        break
    if f_idx % 5 == 0:  # sample every 5th frame (same as frame_interval in config)
        dets = hd.detect_hazards_in_frame(frame)
        ts = round(f_idx / fps, 2)
        for d in dets:
            inc = hazard_tracker.add_or_update_detection(
                hazard_class=d["class"],
                confidence=d["confidence"],
                severity=d["severity"],
                timestamp_sec=ts,
                frame_index=f_idx,
                bbox=d["bboxPixels"],
                frame=None
            )
            raw_incidents.append({
                "frame": f_idx,
                "t_sec": ts,
                "class": d["class"],
                "raw_class": d["raw_class"],
                "confidence": d["confidence"],
                "bbox": d["bboxPixels"],
                "severity": d["severity"],
                "incident_id": inc["id"]
            })
    f_idx += 1
cap.release()

print(f"\nRaw detection events (frame-level, before dedup): {len(raw_incidents)}")
print(f"\n{'Frame':>5} | {'Time':>5} | {'Class':>12} | {'Raw':>20} | {'Conf':>6} | {'Sev':>6} | BBox")
print("-" * 90)
for r in raw_incidents[:30]:
    print(
        f"{r['frame']:>5} | {r['t_sec']:>5.2f}s | "
        f"{r['class']:>12} | {r['raw_class']:>20} | "
        f"{r['confidence']:>5.1f}% | {r['severity']:>6} | {r['bbox']}"
    )
if len(raw_incidents) > 30:
    print(f"  ... and {len(raw_incidents)-30} more detections.")

summary = hazard_tracker.get_summary()
print("\n" + "=" * 68)
print("  Deduplicated Incident Summary")
print("=" * 68)
print(f"  totalDetected  : {summary['totalDetected']}")
print(f"  activeIncidents: {summary['activeIncidents']}")
print(f"  byType         : {summary['byType']}")
print(f"  bySeverity     : {summary['bySeverity']}")
print("=" * 68)
print("\n  Top 10 unique incidents (by incident ID):")
for inc in summary["incidents"][:10]:
    print(
        f"    {inc['id']} | type={inc['type']:>12} | conf={inc['confidence']:>5.1f}% | "
        f"sev={inc['severity']:>6} | t={inc['timestampFormatted']} | "
        f"seen={inc['observationCount']}x"
    )

print("\n  Final config settings used:")
print(f"    conf_threshold : {hd.conf_threshold}  (tuned from 0.25 -> 0.20)")
print(f"    roi y_min      : {hd.roi['y_min']}  (tuned from 0.35 -> 0.25 to capture more road)")
