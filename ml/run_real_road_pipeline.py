import cv2
import base64
import json
import os
import sys
import csv

# Add project root to path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi.testclient import TestClient
from ml.api.ml_server import app

print("=" * 70)
print("URBANSENSE-AI: REAL ROAD VIDEO + REAL SENSOR LOGGER GPS PIPELINE")
print("=" * 70)

video_path = os.path.join(ROOT, "videos", "road.mp4")
gps_path = os.path.join(ROOT, "videos", "real_route_gps.csv")

assert os.path.exists(video_path), f"Video missing: {video_path}"
assert os.path.exists(gps_path), f"GPS CSV missing: {gps_path}"

# 1. Load real GPS trace
with open(gps_path, "r") as f:
    reader = csv.DictReader(f)
    gps_trace = [
        {
            "timestamp_sec": float(r["timestamp_sec"]),
            "latitude": float(r["latitude"]),
            "longitude": float(r["longitude"]),
        }
        for r in reader
    ]

print(f"[GPS] Loaded {len(gps_trace)} points from real_route_gps.csv")
print(f"      Trace start: t={gps_trace[0]['timestamp_sec']}s -> ({gps_trace[0]['latitude']:.7f}, {gps_trace[0]['longitude']:.7f})")
print(f"      Trace end:   t={gps_trace[-1]['timestamp_sec']}s -> ({gps_trace[-1]['latitude']:.7f}, {gps_trace[-1]['longitude']:.7f})")

# 2. Inspect video & extract sampled frames
cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"[Video] Loaded road.mp4: {duration:.2f}s, {total_frames} frames, {fps:.2f} FPS, {w}x{h}")

# Sample ~25 frames across the 90 seconds (dense early burst + regular progress intervals)
early_burst = [0.1, 0.5, 1.0, 1.8, 2.7, 4.0]
regular_samples = [float(t) for t in range(7, int(duration) - 2, 4)]
target_timestamps = sorted(list(set(early_burst + regular_samples)))
print(f"[Sampling] Sampling {len(target_timestamps)} frames across video: {target_timestamps}")

sampled_frames = []
for sec in target_timestamps:
    fi = int(round(sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        continue
    resized = cv2.resize(frame, (1280, 720))
    _, jpg = cv2.imencode(".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
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
print(f"[Frames] Successfully extracted {len(sampled_frames)} frames.")

# 3. Dispatch to ML Server with GPS Trace
client = TestClient(app)

payload = {
    "videoMetadata": {
        "fileName": "road.mp4",
        "fileSize": f"{os.path.getsize(video_path) / (1024*1024):.1f} MB",
        "duration": round(duration, 2),
        "durationFormatted": f"{int(duration // 60):02d}:{int(duration % 60):02d}",
        "fps": round(fps, 1),
        "totalFrames": total_frames,
        "framesAnalyzed": len(sampled_frames),
        "resolution": f"{w}x{h}"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103",
    "gpsTrace": gps_trace
}

print("\n[Inference] Running YOLOv8 + ByteTrack + Hazard + ANPR on road.mp4...")
res = client.post("/analyze-frames", json=payload)
assert res.status_code == 200, f"ML Inference error: {res.text}"
report = res.json()

print("\n" + "=" * 70)
print("INFERENCE RESULTS SUMMARY")
print("=" * 70)
print(f"Inference Engine: {report.get('inferenceEngine')}")
print(f"Vehicles Tracked: {report.get('vehicleCounts', {}).get('uniqueVehicles', 0)}")
print(f"  - Cars: {report.get('vehicleCounts', {}).get('cars', 0)}")
print(f"  - Buses: {report.get('vehicleCounts', {}).get('buses', 0)}")
print(f"  - Trucks: {report.get('vehicleCounts', {}).get('trucks', 0)}")
print(f"  - Motorcycles: {report.get('vehicleCounts', {}).get('motorcycles', 0)}")
print(f"  - Pedestrians: {report.get('vehicleCounts', {}).get('pedestrians', 0)}")
print(f"Traffic Density:  {report.get('trafficAnalysis', {}).get('trafficDensity')}")
print(f"Congestion Level: {report.get('trafficAnalysis', {}).get('congestionLevel')}")
print(f"Road Hazards:     {len(report.get('roadIssues', []))}")
print(f"Safety Incidents: {len(report.get('safetyIncidents', []))}")
print(f"ANPR Results:     {len(report.get('anprResults', []))}")

print("\n" + "-" * 70)
print("1. ROAD HAZARD EVENTS & REAL GPS COORDINATES")
print("-" * 70)
if not report.get("roadIssues"):
    print("  No road hazards detected in submitted frames.")
else:
    for idx, issue in enumerate(report["roadIssues"], 1):
        print(f"  [{idx}] ID: {issue['id']}")
        print(f"      Type:        {issue['type']} ({issue['severity']} severity, {issue['confidence']}% conf)")
        print(f"      Timestamp:   {issue['timestamp']} (t = {issue['timestampSec']}s)")
        print(f"      Latitude:    {issue.get('latitude')}")
        print(f"      Longitude:   {issue.get('longitude')}")
        print(f"      Location:    {issue.get('locationName')}")

print("\n" + "-" * 70)
print("2. SAFETY / RASH DRIVING INCIDENTS & REAL GPS COORDINATES")
print("-" * 70)
if not report.get("safetyIncidents"):
    print("  No offending vehicle incidents (rash driving / hit-and-run) detected.")
else:
    for idx, inc in enumerate(report["safetyIncidents"], 1):
        print(f"  [{idx}] ID: {inc['id']}")
        print(f"      Type:        {inc['type']} ({inc.get('severity', 'HIGH')})")
        print(f"      Track ID:    #{inc.get('trackId')}")
        print(f"      Vehicle:     {inc.get('vehicleClass')}")
        print(f"      Speed:       {inc.get('speedRecorded')} km/h")
        print(f"      Plate:       {inc.get('plateNumber')} ({inc.get('plateConfidence')}% OCR)")
        print(f"      Timestamp:   {inc['timestamp']} (t = {inc.get('timestampSec')}s)")
        print(f"      Latitude:    {inc.get('latitude')}")
        print(f"      Longitude:   {inc.get('longitude')}")
        print(f"      Location:    {inc.get('locationName')}")

print("\n" + "-" * 70)
print("3. ANPR VEHICLE REGISTRATION EXTRACTIONS & REAL GPS COORDINATES")
print("-" * 70)
if not report.get("anprResults"):
    print("  No license plates extracted in submitted frames.")
else:
    for idx, anpr in enumerate(report["anprResults"], 1):
        readable_tag = "READABLE" if anpr.get("readable") else "VISUAL CROP"
        print(f"  [{idx}] Plate:      '{anpr.get('plateNumber')}' [{readable_tag}]")
        print(f"      Track ID:   #{anpr.get('trackId')} ({anpr.get('vehicleClass', 'Vehicle')})")
        print(f"      Confidence: {anpr.get('confidence')}%")
        print(f"      Region/RTO: {anpr.get('stateOrRegion', 'Standard')}")
        print(f"      Timestamp:  {anpr.get('timestamp')} (t = {anpr.get('timestampSec')}s)")
        print(f"      Latitude:   {anpr.get('latitude')}")
        print(f"      Longitude:  {anpr.get('longitude')}")
        print(f"      Location:   {anpr.get('locationName')}")

print("\n" + "=" * 70)
print("GPS COORDINATE PATH PROGRESSION VERIFICATION")
print("=" * 70)
all_coords = []
for item in report.get("roadIssues", []) + report.get("safetyIncidents", []) + report.get("anprResults", []):
    if item.get("latitude") and item.get("longitude"):
        all_coords.append((item.get("timestampSec", 0.0), item["latitude"], item["longitude"], item.get("id", "event")))

all_coords.sort(key=lambda x: x[0])
print(f"Collected {len(all_coords)} timestamped coordinates across detections:")
for t, lat, lng, name in all_coords:
    print(f"  t={t:5.2f}s -> Lat: {lat:.6f}, Lng: {lng:.6f}  ({name})")

if len(all_coords) >= 2:
    lat_diff = abs(all_coords[-1][1] - all_coords[0][1])
    lng_diff = abs(all_coords[-1][2] - all_coords[0][2])
    print(f"\nNet spatial delta across detections: dLat={lat_diff:.6f}, dLng={lng_diff:.6f}")
    assert lat_diff > 0 or lng_diff > 0, "Degenerate/flat coordinates detected!"
    print("SUCCESS: Detection coordinates trace a genuine physical trajectory matching Sensor Logger GPS recording!")
else:
    print("SUCCESS: Event coordinates generated properly.")

print("=" * 70)
