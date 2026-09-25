import csv
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
input_csv = os.path.join(ROOT, "videos", "sensor_logger_raw.csv")
output_csv = os.path.join(ROOT, "videos", "real_route_gps.csv")
public_csv = os.path.join(ROOT, "public", "real_route_gps.csv")

with open(input_csv, "r") as f:
    rows = list(csv.DictReader(f))

# Parse raw points
raw_points = []
for r in rows:
    raw_points.append({
        "time_ns": int(r["time"]),
        "seconds_elapsed": float(r["seconds_elapsed"]),
        "latitude": float(r["latitude"]),
        "longitude": float(r["longitude"]),
        "speed": float(r["speed"]) if r.get("speed") else 0.0,
        "bearing": float(r["bearing"]) if r.get("bearing") else 0.0,
    })

# Base offset: Align first GPS sample to 0.0s
t0 = raw_points[0]["seconds_elapsed"]

# Resample at 0.5s intervals across the ~103s duration using linear interpolation
t_end = raw_points[-1]["seconds_elapsed"] - t0
step = 0.5

resampled = []
cur_t = 0.0

idx = 0
while cur_t <= t_end + 1e-4:
    # Find bounding points in raw trace
    t_target = cur_t + t0
    while idx < len(raw_points) - 2 and raw_points[idx + 1]["seconds_elapsed"] < t_target:
        idx += 1
    
    p0 = raw_points[idx]
    p1 = raw_points[min(idx + 1, len(raw_points) - 1)]
    
    dt = p1["seconds_elapsed"] - p0["seconds_elapsed"]
    if dt > 1e-6:
        alpha = (t_target - p0["seconds_elapsed"]) / dt
        alpha = max(0.0, min(1.0, alpha))
    else:
        alpha = 0.0
    
    lat = p0["latitude"] + alpha * (p1["latitude"] - p0["latitude"])
    lng = p0["longitude"] + alpha * (p1["longitude"] - p0["longitude"])
    
    resampled.append({
        "timestamp_sec": round(cur_t, 2),
        "latitude": round(lat, 7),
        "longitude": round(lng, 7),
    })
    cur_t = round(cur_t + step, 2)

# Write to videos/real_route_gps.csv and public/real_route_gps.csv
for out_path in [output_csv, public_csv]:
    with open(out_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp_sec", "latitude", "longitude"])
        for pt in resampled:
            writer.writerow([pt["timestamp_sec"], f"{pt['latitude']:.7f}", f"{pt['longitude']:.7f}"])

print(f"Successfully converted {len(rows)} raw points into {len(resampled)} regular 0.5s intervals (0.0s to {resampled[-1]['timestamp_sec']}s)")
print(f"Saved to:\n  - {output_csv}\n  - {public_csv}")
print(f"Sample start: t={resampled[0]['timestamp_sec']}s -> ({resampled[0]['latitude']}, {resampled[0]['longitude']})")
print(f"Sample end:   t={resampled[-1]['timestamp_sec']}s -> ({resampled[-1]['latitude']}, {resampled[-1]['longitude']})")
