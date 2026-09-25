import cv2
import requests
import base64
import json

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5

earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
targetTimestamps = list(earlyBurst)

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
    "busId": "BUS-103"
}

print(f"Sending {len(sampled_frames)} frames to PID 1844 (http://127.0.0.1:8000/analyze-frames)...")
res = requests.post("http://127.0.0.1:8000/analyze-frames", json=payload, timeout=120)
print(f"Status: {res.status_code}")
if res.ok:
    data = res.json()
    anpr = data.get("anprResults", [])
    print(f"ANPR Results: {len(anpr)}")
    for a in anpr:
        print(f"  {a}")
    safety = data.get("safetySummary", {}).get("incidents", [])
    print(f"Safety Incidents: {len(safety)}")
    for s in safety:
        print(f"  {s}")
else:
    print("Error:", res.text[:500])
