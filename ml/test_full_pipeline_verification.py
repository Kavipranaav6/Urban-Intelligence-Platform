import cv2, os, sys, base64, json, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

print("Running E2E pipeline verification with road.mp4 and media_1790144511811.csv...")

# 1. Read CSV
csv_path = os.path.join(ROOT, "scratch", "user_location.csv")
if not os.path.exists(csv_path):
    artifact_csv = r"C:\Users\Kavipranaav LM\.gemini\antigravity-ide\brain\943d7166-976d-4b5b-bb16-5b62f20340f9\.user_uploaded\media_1790144511811.csv"
    if os.path.exists(artifact_csv):
        csv_path = artifact_csv

with open(csv_path, "r", encoding="utf-8") as f:
    csv_content = f.read()

print(f"Loaded CSV ({len(csv_content)} bytes)")

# 2. Extract frames from road.mp4
cap = cv2.VideoCapture("videos/road.mp4")
fc = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
duration = fc / fps
print(f"road.mp4: {fc} frames, {fps:.1f} fps, {duration:.1f}s")

# Sample key frames including the oncoming car around frame 450-465 (15.0 - 15.5s)
sample_frame_indices = [30, 90, 150, 240, 360, 440, 450, 460, 470, 600, 800, 1000]
sampled_frames = []

for fi in sample_frame_indices:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    t_sec = fi / fps
    m = int(t_sec // 60)
    s = int(t_sec % 60)
    _, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
    sampled_frames.append({
        "timestamp": f"{m:02d}:{s:02d}",
        "timestampSec": round(t_sec, 2),
        "frameIndex": fi,
        "frameDataUrl": b64
    })
cap.release()
print(f"Extracted {len(sampled_frames)} frames.")

# 3. Post to Node Server /api/video/analyze-frames
payload = {
    "videoMetadata": {
        "fileName": "road.mp4",
        "fileSize": "12.4 MB",
        "duration": round(duration, 2),
        "durationFormatted": "01:30",
        "fps": fps,
        "totalFrames": fc,
        "framesAnalyzed": len(sampled_frames),
        "resolution": "848x478"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103",
    "gpsCsvContent": csv_content
}

req_data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request("http://127.0.0.1:3000/api/video/analyze-frames", data=req_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=60) as resp:
    res_json = json.loads(resp.read().decode("utf-8"))

report = res_json.get("report", {})
ingested = res_json.get("ingestedEvents", [])

print("\n--- RESULTS ---")
print(f"Inference Engine: {report.get('inferenceEngine')}")
print(f"Vehicles Unique: {report.get('vehicleCounts', {}).get('uniqueVehicles')}")
print(f"Road Issues Count: {len(report.get('roadIssues', []))}")
print(f"ANPR Results Count: {len(report.get('anprResults', []))}")
for a in report.get('anprResults', []):
    print(f"  Plate: {a.get('plateNumber')} | Conf: {a.get('confidence')}% | Class: {a.get('vehicleClass')} | GPS: {a.get('latitude')}, {a.get('longitude')} | Evidence: {bool(a.get('evidenceFrame'))}")

print(f"\nIngested GIS Events: {len(ingested)}")
for e in ingested:
    print(f"  Event: {e.get('id')} ({e.get('category')}) - {e.get('type')} | Lat: {e.get('latitude')}, Lng: {e.get('longitude')} | Loc: {e.get('locationName')}")

# Verify bus location updated in DB
buses_req = urllib.request.Request("http://127.0.0.1:3000/api/buses")
with urllib.request.urlopen(buses_req) as b_resp:
    buses_list = json.loads(b_resp.read().decode("utf-8"))
bus_103 = next((b for b in buses_list if b["id"] == "BUS-103"), None)
if bus_103:
    print(f"\nBUS-103 updated coords: Lat {bus_103.get('lat')}, Lng {bus_103.get('lng')} | Route waypoints: {len(bus_103.get('routeWaypoints', []))}")

print("\nVerification successfully finished.")
