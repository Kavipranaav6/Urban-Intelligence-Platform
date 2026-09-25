import requests
import cv2
import base64

# Step 1: Check events before video upload
print("--- STEP 1: Checking events before upload ---")
r1 = requests.get("http://localhost:3000/api/events")
print("GET /api/events status:", r1.status_code)
events_before = r1.json()
print("Events count before upload:", len(events_before))
print("Events content:", events_before)

# Step 2: Sample frames and send to Express pipeline
print("\n--- STEP 2: Processing video through pipeline ---")
cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30
sampled_frames = []
for target_f in [45, 135, 230, 475, 600]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_f)
    ret, frame = cap.read()
    if not ret:
        continue
    small = cv2.resize(frame, (640, 360))
    _, jpg = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
    sec = target_f / float(fps)
    sampled_frames.append({
        "timestamp": f"{int(sec//60):02d}:{int(sec%60):02d}",
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
    "busId": "BUS-103",
    "ingestToGis": True
}

res = requests.post("http://localhost:3000/api/video/analyze-frames", json=payload, timeout=90)
print("POST /api/video/analyze-frames status:", res.status_code)
if res.ok:
    data = res.json()
    ingested = data.get("ingestedEvents", [])
    print(f"Ingested events count: {len(ingested)}")
    for ev in ingested:
        print(f"  [Ingested] ID={ev.get('id')} Type={ev.get('type')} GPS=({ev.get('latitude')}, {ev.get('longitude')}) Severity={ev.get('severity')}")
else:
    print("Error response:", res.text[:300])

# Step 3: Check events after video upload
print("\n--- STEP 3: Checking events after upload ---")
r2 = requests.get("http://localhost:3000/api/events")
events_after = r2.json()
print("Events count after upload:", len(events_after))
for ev in events_after:
    plate = ev.get("details", {}).get("plateNumber", "N/A")
    print(f"  -> Pin on Map: ID={ev.get('id')} | Type={ev.get('type')} | Lat={ev.get('latitude')} | Lng={ev.get('longitude')} | Plate={plate} | Severity={ev.get('severity')}")
