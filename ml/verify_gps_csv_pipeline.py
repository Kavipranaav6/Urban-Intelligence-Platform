import cv2
import base64
import json
import os
import sys

# Add project root to path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi.testclient import TestClient
from ml.api.ml_server import app
from ml.inference.incident_detector import interpolate_from_gps_trace, interpolate_gps_location

print("=" * 60)
print("TEST 1: Verify GPS CSV Linear Interpolation Logic")
print("=" * 60)

# Load sample GPS CSV
csv_path = os.path.join(ROOT, "videos", "driving_gps.csv")
assert os.path.exists(csv_path), f"Missing {csv_path}"

with open(csv_path, "r") as f:
    csv_lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]

header = csv_lines[0].split(",")
gps_trace = []
for line in csv_lines[1:]:
    parts = line.split(",")
    gps_trace.append({
        "timestamp_sec": float(parts[0]),
        "latitude": float(parts[1]),
        "longitude": float(parts[2]),
    })

print(f"Loaded {len(gps_trace)} GPS trace rows from {csv_path}")
print(f"Start: t={gps_trace[0]['timestamp_sec']}s -> ({gps_trace[0]['latitude']}, {gps_trace[0]['longitude']})")
print(f"End:   t={gps_trace[-1]['timestamp_sec']}s -> ({gps_trace[-1]['latitude']}, {gps_trace[-1]['longitude']})")

# Test interpolation at t=1.5s (midpoint between t=1.0 and t=2.0)
pt_mid = interpolate_from_gps_trace(1.5, gps_trace)
expected_lat = round(11.016620 + 0.5 * (11.016440 - 11.016620), 6)
expected_lng = round(76.968150 + 0.5 * (76.968500 - 76.968150), 6)
print(f"Interp @ 1.5s: lat={pt_mid['latitude']} (expected {expected_lat}), lng={pt_mid['longitude']} (expected {expected_lng})")
assert abs(pt_mid['latitude'] - expected_lat) < 1e-5, "Latitude interpolation mismatch!"
assert abs(pt_mid['longitude'] - expected_lng) < 1e-5, "Longitude interpolation mismatch!"

# Test fallback behavior when trace is None or empty
fallback_pt = interpolate_from_gps_trace(5.0, None)
corridor_pt = interpolate_gps_location(5.0)
assert fallback_pt['latitude'] == corridor_pt['latitude'], "Fallback lat does not match corridor telemetry!"
assert fallback_pt['longitude'] == corridor_pt['longitude'], "Fallback lng does not match corridor telemetry!"
print("Fallback logic correctly matches existing corridor telemetry when no GPS trace is passed.")

print("\n" + "=" * 60)
print("TEST 2: End-to-End Pipeline with driving.mp4 + GPS CSV")
print("=" * 60)

# Sample frames from driving.mp4 matching EdgeCameraFeed.tsx burst sampling
video_path = os.path.join(ROOT, "videos", "driving.mp4")
assert os.path.exists(video_path), f"Missing {video_path}"
cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps

target_timestamps = [0.05, 0.25, 0.55, 1.25, 2.00, 3.50, 6.00, 10.00, 15.00, 20.00]
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

print(f"Sampled {len(sampled_frames)} frames from driving.mp4 across {duration:.2f}s timeline")

# Run via FastAPI TestClient on ml_server
client = TestClient(app)

payload_with_gps = {
    "videoMetadata": {
        "fileName": "driving.mp4",
        "fileSize": "22.3 MB",
        "duration": duration,
        "durationFormatted": "00:24",
        "fps": 30,
        "totalFrames": total_frames,
        "framesAnalyzed": len(sampled_frames),
        "resolution": "1280x720"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103",
    "gpsTrace": gps_trace
}

print("Dispatching request to ML Server /analyze-frames WITH GPS trace...")
res_with_gps = client.post("/analyze-frames", json=payload_with_gps)
assert res_with_gps.status_code == 200, f"ML server failed: {res_with_gps.text}"
report_with_gps = res_with_gps.json()

print(f"\n--- ML SERVER REPORT SUMMARY (WITH GPS TRACE) ---")
print(f"Inference Engine: {report_with_gps['inferenceEngine']}")
print(f"Road Issues Found: {len(report_with_gps['roadIssues'])}")
print(f"Safety Incidents: {len(report_with_gps['safetyIncidents'])}")
print(f"ANPR Results: {len(report_with_gps['anprResults'])}")

print("\n--- ROAD HAZARDS WITH GPS COORDINATES ---")
for r in report_with_gps['roadIssues']:
    print(f"  Hazard {r['id']} ({r['type']}) @ {r['timestamp']} (t={r['timestampSec']}s): lat={r.get('latitude')}, lng={r.get('longitude')}, loc={r.get('locationName')}")
    assert r.get('latitude') is not None and r.get('longitude') is not None, "Hazard coordinate missing!"
    # Verify coordinate lies within GPS CSV range
    assert 11.012 <= r['latitude'] <= 11.017, f"Hazard lat {r['latitude']} out of GPS bounds!"

print("\n--- SAFETY INCIDENTS WITH GPS COORDINATES ---")
for s in report_with_gps['safetyIncidents']:
    print(f"  Safety {s['id']} ({s['type']}) @ {s['timestamp']} (t={s['timestampSec']}s): lat={s.get('latitude')}, lng={s.get('longitude')}, loc={s.get('locationName')}")
    assert s.get('latitude') is not None and s.get('longitude') is not None, "Safety coordinate missing!"
    assert 11.012 <= s['latitude'] <= 11.017, f"Safety lat {s['latitude']} out of GPS bounds!"

print("\n--- ANPR RESULTS WITH GPS COORDINATES ---")
for a in report_with_gps['anprResults']:
    print(f"  Plate {a['plateNumber']} (Track #{a.get('trackId')}) @ {a['timestamp']} (t={a['timestampSec']}s): lat={a.get('latitude')}, lng={a.get('longitude')}, loc={a.get('locationName')}")
    assert a.get('latitude') is not None and a.get('longitude') is not None, "ANPR coordinate missing!"
    assert 11.012 <= a['latitude'] <= 11.017, f"ANPR lat {a['latitude']} out of GPS bounds!"

print("\n" + "=" * 60)
print("TEST 3: End-to-End Pipeline WITHOUT GPS CSV (Fallback Verification)")
print("=" * 60)

payload_without_gps = {
    "videoMetadata": {
        "fileName": "driving.mp4",
        "fileSize": "22.3 MB",
        "duration": duration,
        "durationFormatted": "00:24",
        "fps": 30,
        "totalFrames": total_frames,
        "framesAnalyzed": len(sampled_frames),
        "resolution": "1280x720"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103",
    "gpsTrace": []
}

res_without_gps = client.post("/analyze-frames", json=payload_without_gps)
assert res_without_gps.status_code == 200, f"ML server failed: {res_without_gps.text}"
report_without_gps = res_without_gps.json()

print(f"Report without GPS generated successfully. Hazards: {len(report_without_gps['roadIssues'])}, ANPR: {len(report_without_gps['anprResults'])}")
for s in report_without_gps['safetyIncidents']:
    print(f"  Safety incident {s['id']} uses fallback corridor coordinates: lat={s.get('latitude')}, lng={s.get('longitude')}")
    assert s.get('locationName') == "Lakshmi Mills Junction", "Expected fallback locationName!"

print("\n" + "=" * 60)
print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")
print("=" * 60)
