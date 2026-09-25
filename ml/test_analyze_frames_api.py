import cv2
import base64
import requests
import json

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30
sampled_frames = []

# Sample 5 frames from driving.mp4
for target_f in [45, 135, 230, 475, 600]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_f)
    ret, frame = cap.read()
    if not ret:
        continue
    # Resize to 640x360 just like the frontend canvas does
    small = cv2.resize(frame, (640, 360))
    _, jpg = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
    sec = target_f / float(fps)
    f_min = int(sec // 60)
    f_sec = int(sec % 60)
    sampled_frames.append({
        "timestamp": f"{f_min:02d}:{f_sec:02d}",
        "timestampSec": round(sec, 2),
        "frameIndex": target_f,
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
        "resolution": "640x360"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103"
}

print(f"Sending {len(sampled_frames)} frames to http://127.0.0.1:8000/analyze-frames...")
res = requests.post("http://127.0.0.1:8000/analyze-frames", json=payload, timeout=60)
print(f"Response status: {res.status_code}")

if res.ok:
    data = res.json()
    anpr = data.get("anprResults", [])
    print(f"Total ANPR results returned: {len(anpr)}")
    for p in anpr:
        evidence_preview = p.get('evidenceFrame', '')[:40] if p.get('evidenceFrame') else 'NONE'
        print(f"  ID: {p.get('id')} | Plate: '{p.get('plateNumber')}' | Conf: {p.get('confidence')}% | Readable: {p.get('readable')} | Time: {p.get('timestamp')} | Evidence: {evidence_preview}...")
else:
    print("Error response:", res.text[:300])
