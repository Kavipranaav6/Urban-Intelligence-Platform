import cv2
import requests
import base64

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5

earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
targetTimestamps = [t for t in earlyBurst if t < duration - 0.2]

remainingStart = targetTimestamps[-1] + 1.2
remainingCount = min(14, max(4, int((duration - remainingStart) / 1.5)))
for j in range(remainingCount):
    t = remainingStart + (j / max(1, remainingCount - 1)) * (duration - remainingStart - 0.2)
    targetTimestamps.append(round(t, 2))

print(f"Total timestamps ({len(targetTimestamps)}): {targetTimestamps}")

sampled_frames = []
for sec in targetTimestamps:
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
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

res = requests.post("http://localhost:3000/api/video/analyze-frames", json=payload, timeout=90)
print(f"Response status: {res.status_code}")
if res.ok:
    data = res.json()
    report = data.get("report", {})
    anpr = report.get("anprResults", [])
    print(f"--- ANPR RESULTS IN REPORT ({len(anpr)}) ---")
    for a in anpr:
        print(f"  Plate: '{a.get('plateNumber')}' | Conf: {a.get('confidence')}% | Readable: {a.get('readable')} | ID: {a.get('id')}")
    safety = report.get("safetySummary", {}).get("incidents", [])
    print(f"--- SAFETY INCIDENTS ({len(safety)}) ---")
    for s in safety:
        print(f"  Incident: {s.get('id')} | Type: {s.get('type')} | Track: {s.get('trackId')}")
    ingested = data.get("ingestedEvents", [])
    print(f"--- INGESTED EVENTS ({len(ingested)}) ---")
    for ev in ingested:
        plate = ev.get("details", {}).get("plateNumber", "")
        print(f"  Event: {ev.get('id')} | Category: {ev.get('category')} | Type: {ev.get('type')} | Plate: '{plate}'")
else:
    print("Error:", res.text[:300])
