import cv2
import requests
import base64
import json

print("=== STEP 1: Running FULL driving.mp4 through ingestToGis pipeline ===")

cap = cv2.VideoCapture("videos/driving.mp4")
fps = 30.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps

target_frames = [0, 2, 4, 6, 8, 10, 20, 30, 40, 50, 60, 70, 80, 100, 135, 180, 230, 300, 380, 475, 550, 600, 680, 720]
print(f"Sampling {len(target_frames)} frames across full clip (0 to {total_frames} frames, {duration:.1f}s)...")

sampled_frames = []
for fi in target_frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        continue
    small = cv2.resize(frame, (640, 360))
    _, jpg = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")
    sec = fi / fps
    f_min = int(sec // 60)
    f_sec = int(sec % 60)
    sampled_frames.append({
        "timestamp": f"{f_min:02d}:{f_sec:02d}",
        "timestampSec": round(sec, 2),
        "frameIndex": fi,
        "frameDataUrl": b64
    })

cap.release()

payload = {
    "videoMetadata": {
        "fileName": "driving.mp4",
        "fileSize": "15.0 MB",
        "duration": round(duration, 1),
        "durationFormatted": "00:24",
        "fps": 30,
        "totalFrames": total_frames,
        "framesAnalyzed": len(sampled_frames),
        "resolution": "640x360"
    },
    "sampledFrames": sampled_frames,
    "busId": "BUS-103",
    "ingestToGis": True
}

print(f"Posting {len(sampled_frames)} frames to http://localhost:3000/api/video/analyze-frames...")
res = requests.post("http://localhost:3000/api/video/analyze-frames", json=payload, timeout=120)
print(f"Pipeline POST status: {res.status_code}")

if not res.ok:
    print("Error:", res.text[:500])
    exit(1)

data = res.json()
report = data.get("report", {})
ingested = data.get("ingestedEvents", [])

print(f"\n--- INGESTED EVENTS RETURNED ({len(ingested)}) ---")
for ev in ingested:
    plate = ev.get("details", {}).get("plateNumber", "N/A")
    print(f"  [{ev.get('category')}] {ev.get('id')} | {ev.get('type')} | Severity: {ev.get('severity')} | Plate: {plate} | GPS: ({ev.get('latitude')}, {ev.get('longitude')})")

print("\n=== VERIFYING DB.EVENTS FROM API ===")
r_events = requests.get("http://localhost:3000/api/events")
all_events = r_events.json()
print(f"Total db.events count: {len(all_events)}")
for ev in all_events:
    plate = ev.get("details", {}).get("plateNumber", "N/A")
    conf = ev.get("confidence")
    print(f"  PIN -> ID: {ev.get('id'):<12} Category: {ev.get('category'):<12} Type: {ev.get('type'):<28} Severity: {ev.get('severity'):<8} Plate: {plate:<15} Conf: {conf}%")

print("\n=== STEP 2: SIMULATING CLUSTER HEATMAP ON THIS EVENT SET ===")
# Haversine clustering matching GISMap.tsx
import math
def get_dist_meters(lat1, lon1, lat2, lon2):
    R = 6371e3
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

cluster_radius = 150.0
clusters = []
for ev in all_events:
    matched = False
    for c in clusters:
        if get_dist_meters(c['lat'], c['lng'], ev['latitude'], ev['longitude']) <= cluster_radius:
            c['events'].append(ev)
            c['lat'] = sum(e['latitude'] for e in c['events']) / len(c['events'])
            c['lng'] = sum(e['longitude'] for e in c['events']) / len(c['events'])
            matched = True
            break
    if not matched:
        clusters.append({
            'lat': ev['latitude'],
            'lng': ev['longitude'],
            'events': [ev],
            'label': ev.get('locationName', 'Incident Cluster')
        })

weights = {'CRITICAL': 1.0, 'HIGH': 0.8, 'MEDIUM': 0.5, 'LOW': 0.25}
print(f"Total Clusters Formed: {len(clusters)}")
for idx, c in enumerate(clusters, 1):
    sev_sum = sum(weights.get(e['severity'], 0.5) for e in c['events'])
    avg_sev = sev_sum / len(c['events'])
    vol_score = min(1.0, len(c['events']) / 3.0)
    intensity = min(0.95, max(0.35, avg_sev * 0.55 + vol_score * 0.45))
    radius = min(280, max(100, 110 + len(c['events']) * 25))
    types = [e['type'] for e in c['events']]
    print(f"  Cluster {idx} ({c['label']}):")
    print(f"    Centroid: ({c['lat']:.6f}, {c['lng']:.6f})")
    print(f"    Event Count: {len(c['events'])} events -> {types}")
    print(f"    Heat Intensity: {intensity*100:.1f}% | Visual Radius: {radius}m")
