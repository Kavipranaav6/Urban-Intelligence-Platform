import cv2
import requests
import base64

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5

# Matches EdgeCameraFeed.tsx sampling exactly
earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
targetTimestamps = [t for t in earlyBurst if t < duration - 0.2]

lastBurstTime = targetTimestamps[-1] if targetTimestamps else 0
remainingStart = lastBurstTime + 1.2
if remainingStart < duration:
    remainingSlots = min(12, max(3, int((duration - remainingStart) / 1.6)))
    for j in range(remainingSlots):
        t = remainingStart + (j / max(1, remainingSlots - 1)) * (duration - remainingStart - 0.2)
        targetTimestamps.append(round(t, 2))

print(f"Sampling {len(targetTimestamps)} frames: {targetTimestamps}")

sampled_frames = []
for sec in targetTimestamps:
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    # 1280x720 high-resolution offscreen canvas matching EdgeCameraFeed.tsx
    small = cv2.resize(frame, (1280, 720))
    _, jpg = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
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

# 1. First test python service directly on 8000
print(f"Testing http://127.0.0.1:8000/analyze-frames...")
res_py = requests.post("http://127.0.0.1:8000/analyze-frames", json=payload, timeout=90)
print(f"Python ML Server Status: {res_py.status_code}")
if res_py.ok:
    py_data = res_py.json()
    py_anpr = py_data.get("anprResults", [])
    print(f"Python ANPR Results count: {len(py_anpr)}")
    for a in py_anpr:
        print(f"  Track: {a.get('trackId')} | Plate: '{a.get('plateNumber')}' | Conf: {a.get('confidence')}% | Readable: {a.get('readable')} | Region: {a.get('stateOrRegion')}")

# 2. Test full end-to-end server.ts pipeline on 3000
print(f"\nTesting http://localhost:3000/api/video/analyze-frames...")
res = requests.post("http://localhost:3000/api/video/analyze-frames", json=payload, timeout=90)
print(f"Server.ts Status: {res.status_code}")
if res.ok:
    data = res.json()
    report = data.get("report", {})
    anpr = report.get("anprResults", [])
    print(f"Total ANPR in Report: {len(anpr)}")
    for a in anpr:
        print(f"  Plate: '{a.get('plateNumber')}' | Conf: {a.get('confidence')}% | Readable: {a.get('readable')}")
    safety = report.get("safetySummary", {}).get("incidents", [])
    print(f"Total Safety Incidents: {len(safety)}")
    for s in safety:
        print(f"  Safety: {s.get('id')} | Type: {s.get('type')} | Track: {s.get('trackId')} | Plate: '{s.get('plateNumber')}'")
    ingested = data.get("ingestedEvents", [])
    print(f"Total Ingested Events: {len(ingested)}")
    for ev in ingested:
        print(f"  Event: {ev.get('id')} | Category: {ev.get('category')} | Type: {ev.get('type')} | Plate: '{ev.get('details', {}).get('plateNumber', '')}' | Conf: {ev.get('confidence')}%")
else:
    print("Error:", res.text[:400])
