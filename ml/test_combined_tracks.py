import os, sys, cv2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.detector import YOLODetector
from ml.inference.anpr_detector import ANPRDetector

yolo = YOLODetector()
anpr = ANPRDetector()

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5
earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
targetTimestamps = [t for t in earlyBurst if t < duration - 0.2]
remainingStart = targetTimestamps[-1] + 1.2
if remainingStart < duration:
    remainingSlots = min(12, max(3, int((duration - remainingStart) / 1.6)))
    for j in range(remainingSlots):
        t = remainingStart + (j / max(1, remainingSlots - 1)) * (duration - remainingStart - 0.2)
        targetTimestamps.append(round(t, 2))

for idx, sec in enumerate(targetTimestamps):
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    resized = cv2.resize(frame, (1280, 720))
    dets = yolo.track_frame(resized, conf_threshold=0.25, persist=(idx > 0))
    for d in dets:
        tid = d.get("track_id", -1)
        cls = d.get("class", "")
        bbox = d.get("bboxPixels", [0,0,0,0])
        if cls in ("car", "truck", "bus", "motorcycle"):
            anpr.extract_registration(resized, bbox, track_id=tid, timestamp_sec=sec, vehicle_class=cls)
cap.release()

reads_2 = anpr.track_readings.get(2, [])
reads_52 = anpr.track_readings.get(52, [])

print(f"Track 2 valid reads: {len([r for r in reads_2 if r.get('plate')])}")
for r in reads_2:
    if r.get('plate'):
        print(f"  T2 @ {r['timestampSec']}s: plate='{r['plate']}' conf={r['confidence']}%")

print(f"\nTrack 52 valid reads: {len([r for r in reads_52 if r.get('plate')])}")
for r in reads_52:
    if r.get('plate'):
        print(f"  T52 @ {r['timestampSec']}s: plate='{r['plate']}' conf={r['confidence']}%")

combined_reads = reads_2 + reads_52
print(f"\n=== COMBINED POOL (Track 2 + Track 52: {len(combined_reads)} frames) ===")
vote_counts = {}
conf_sums = {}
for r in combined_reads:
    p = r.get("plate")
    if p and r.get("readable"):
        vote_counts[p] = vote_counts.get(p, 0) + 1
        conf_sums[p] = conf_sums.get(p, 0.0) + r.get("confidence", 0.0)

for p, count in sorted(vote_counts.items(), key=lambda x: x[1], reverse=True):
    avg_c = conf_sums[p] / count
    print(f"  Plate: '{p}' -> {count} votes (avg conf: {avg_c:.1f}%)")

winner = max(vote_counts.keys(), key=lambda p: (vote_counts[p], conf_sums[p]))
print(f"\nWINNER VIA COMBINED MAJORITY VOTE: '{winner}' ({vote_counts[winner]} votes, avg conf: {conf_sums[winner]/vote_counts[winner]:.1f}%)")
