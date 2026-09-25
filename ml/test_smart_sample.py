import cv2
import requests
import base64

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0

# Timestamps covering motorcycle cut-in (0.2-0.5s), car plate (1.8-2.6s), and road hazards (4-8s)
timestamps = [0.25, 0.6, 1.2, 1.8, 2.1, 2.5, 3.5, 5.0, 7.0, 9.5, 12.0, 15.0, 18.0, 21.0, 24.0]

print(f"Testing {len(timestamps)} timestamps with 1280x720 canvas...")
sampled_frames = []
for sec in timestamps:
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    # 1280x720
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
        "duration": 24.5,
        "durationFormatted": "00:24",
        "fps": 30,
        "totalFrames": 736,
        "framesAnalyzed": len(sampled_frames),
        "resolution": "1280x720"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103"
}

res = requests.post("http://127.0.0.1:8000/analyze-frames", json=payload, timeout=60)
print(f"Status: {res.status_code}")
if res.ok:
    data = res.json()
    anpr = data.get("anprResults", [])
    print(f"Total ANPR results: {len(anpr)}")
    for a in anpr:
        print(f"  ANPR: id={a.get('id')} track={a.get('trackId')} plate='{a.get('plateNumber')}' conf={a.get('confidence')}% readable={a.get('readable')}")
    safety = data.get("safetySummary", {}).get("incidents", [])
    print(f"Total Safety Incidents: {len(safety)}")
    for s in safety:
        print(f"  Safety: id={s.get('id')} type={s.get('type')} track={s.get('trackId')} plate='{s.get('plateNumber')}'")
else:
    print("Error:", res.text[:300])
