import os
import sys
import cv2
import base64
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.detector import YOLODetector
from ml.inference.video_processor import VideoProcessor
from ml.api.ml_server import app
from fastapi.testclient import TestClient

client = TestClient(app)

# Load frames from driving.mp4 with 1280x720 and also 640x360
cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
duration = 24.5

earlyBurst = [0.05, 0.15, 0.25, 0.38, 0.55, 0.85, 1.25, 1.65, 2.00, 2.35, 2.70]
targetTimestamps = list(earlyBurst)
remainingStart = targetTimestamps[-1] + 1.2
remainingSlots = min(12, max(3, int((duration - remainingStart) / 1.6)))
for j in range(remainingSlots):
    t = remainingStart + (j / max(1, remainingSlots - 1)) * (duration - remainingStart - 0.2)
    targetTimestamps.append(round(t, 2))

print(f"Target Timestamps ({len(targetTimestamps)}): {targetTimestamps}")

def test_payload(width, height):
    print(f"\n================ TESTING RESOLUTION {width}x{height} ================")
    sampled_frames = []
    for sec in targetTimestamps:
        fi = int(round(sec * fps))
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ret, frame = cap.read()
        if not ret: continue
        resized = cv2.resize(frame, (width, height))
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

    payload = {
        "videoMetadata": {
            "fileName": "driving.mp4",
            "fileSize": "15.0 MB",
            "duration": duration,
            "durationFormatted": "00:24",
            "fps": 30,
            "totalFrames": 736,
            "framesAnalyzed": len(sampled_frames),
            "resolution": f"{width}x{height}"
        },
        "sampledFrames": sampled_frames,
        "busId": "BUS-103"
    }

    res = client.post("/analyze-frames", json=payload)
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        anpr = data.get("anprResults", [])
        print(f"ANPR Results count: {len(anpr)}")
        for a in anpr:
            print(f"  TrackId: {a.get('trackId')} | Plate: '{a.get('plateNumber')}' | Readable: {a.get('readable')} | Conf: {a.get('confidence')}% | State: {a.get('stateOrRegion')}")
        
        safety = data.get("safetySummary", {}).get("incidents", [])
        print(f"Safety Incidents count: {len(safety)}")
        for s in safety:
            print(f"  Incident: {s.get('id')} | Type: {s.get('type')} | Track: {s.get('trackId')} | Plate: '{s.get('plateNumber')}' ({s.get('plateConfidence')}%)")
    else:
        print("Error:", res.text[:500])

test_payload(1280, 720)
test_payload(640, 360)
cap.release()
