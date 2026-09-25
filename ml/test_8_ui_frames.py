import cv2
import requests
import base64
import json

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5
sampleCount = 8

sampledFrames = []
for i in range(sampleCount):
    timeFraction = (i + 0.5) / sampleCount
    targetTime = min(duration - 0.1, max(0.1, duration * timeFraction))
    fi = int(round(targetTime * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    small = cv2.resize(frame, (640, 360))
    _, jpg = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
    m = int(targetTime // 60)
    s = int(targetTime % 60)
    sampledFrames.append({
        "timestamp": f"{m:02d}:{s:02d}",
        "timestampSec": round(targetTime, 2),
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
        "framesAnalyzed": len(sampledFrames),
        "resolution": "640x360"
    },
    "sampledFrames": sampledFrames,
    "busId": "BUS-103"
}

print(f"Testing the exact 8 frames sampled by EdgeCameraFeed.tsx...")
for sf in sampledFrames:
    print(f"  Frame at targetTime={sf['timestampSec']}s (fi={sf['frameIndex']})")

res = requests.post("http://127.0.0.1:8000/analyze-frames", json=payload, timeout=60)
print(f"Status: {res.status_code}")
if res.ok:
    data = res.json()
    anpr = data.get("anprResults", [])
    print(f"Total ANPR results returned: {len(anpr)}")
    for a in anpr:
        print(f"  ANPR: id={a.get('id')} trackId={a.get('trackId')} plate='{a.get('plateNumber')}' readable={a.get('readable')} conf={a.get('confidence')}% evidence={'YES' if a.get('evidenceFrame') else 'NO'}")
    safety = data.get("safetySummary", {}).get("incidents", [])
    print(f"Total Safety Incidents: {len(safety)}")
    for s in safety:
        print(f"  Safety: id={s.get('id')} type={s.get('type')} trackId={s.get('trackId')} plate='{s.get('plateNumber')}'")
else:
    print("Error:", res.text[:300])
