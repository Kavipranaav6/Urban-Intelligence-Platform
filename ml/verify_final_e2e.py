import cv2
import requests
import base64
import json

print("=== CLEARING EXISTING DB EVENTS ===")
res_clear = requests.post("http://localhost:3000/api/events/clear")
print("Clear response:", res_clear.json())

# Sample driving.mp4 using EdgeCameraFeed.tsx timestamps & 1280x720 canvas
cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5

earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
targetTimestamps = [t for t in earlyBurst if t < duration - 0.2]
lastBurstTime = targetTimestamps[-1] if targetTimestamps else 0
remainingStart = lastBurstTime + 1.2
if remainingStart < duration:
    remainingSlots = min(12, max(3, int((duration - remainingStart) / 1.6)))
    for j in range(remainingSlots):
        t = remainingStart + (j / max(1, remainingSlots - 1)) * (duration - remainingStart - 0.2)
        targetTimestamps.append(round(t, 2))

sampled_frames = []
for sec in targetTimestamps:
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    resized = cv2.resize(frame, (1280, 720))
    _, jpg = cv2.imencode(".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
    m = int(sec // 60)
    s = int(sec % 60)
    sampled_frames.append({
        "timestamp": f"{m:02d}:{s:02d}",
        "timestampSec": round(sec, 2),
        "frameIndex": fi,
        "frameDataUrl": b64
    })
cap.release()

payload = {
    "videoMetadata": {
        "fileName": "driving.mp4",
        "fileSize": "15.0 MB",
        "duration": duration,
        "durationFormatted": "00:24",
        "fps": 30,
        "totalFrames": 736,
        "framesAnalyzed": len(sampled_frames),
        "resolution": "1280x720"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103",
    "ingestToGis": True
}

print(f"\n=== POSTING TO /api/video/analyze-frames ({len(sampled_frames)} frames) ===")
res = requests.post("http://localhost:3000/api/video/analyze-frames", json=payload, timeout=90)
print(f"Status: {res.status_code}")
data = res.json()
report = data.get("report", {})
ingested = data.get("ingestedEvents", [])

print(f"\nInference Engine: {report.get('inferenceEngine')}")
print(f"Total Ingested Events returned: {len(ingested)}")

print("\n=== FETCHING ALL EVENTS FROM /api/events ===")
res_events = requests.get("http://localhost:3000/api/events")
all_events = res_events.json()

print(f"Total events in db.events: {len(all_events)}")
print(f"{'Event ID':<12} | {'Category':<14} | {'Type':<26} | {'Plate Number':<16} | {'Conf':<6} | {'Severity':<8} | {'Status':<8} | {'Evidence'}")
print("-" * 110)
for ev in all_events:
    eid = ev.get("id", "")
    cat = ev.get("category", "")
    etype = ev.get("type", "")
    plate = ev.get("details", {}).get("plateNumber") or "-"
    conf = f"{ev.get('confidence', 0)}%"
    sev = ev.get("severity", "")
    stat = ev.get("status", "")
    ev_str = "YES (JPEG)" if ev.get("evidence", "").startswith("data:image/jpeg") else ("YES (SVG)" if ev.get("evidence", "").startswith("data:image/svg") else "NO")
    print(f"{eid:<12} | {cat:<14} | {etype:<26} | {plate:<16} | {conf:<6} | {sev:<8} | {stat:<8} | {ev_str}")
