import os
import sys
import cv2
import json
import shutil
import numpy as np

# Set paths
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ml.inference.hazard_detector import HazardDetector, detect_waterlogging_in_frame

OUT_DIR = os.path.join(ROOT, "ml", "debug_crops", "waterlogging_diagnosis")
ARTIFACT_DIR = r"C:\Users\Kavipranaav LM\.gemini\antigravity-ide\brain\8c5609a9-eec2-4888-91a5-06eabf717a8e\waterlogging_diagnosis"

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

hd = HazardDetector()

videos = {
    "road.mp4": os.path.join(ROOT, "videos", "road.mp4"),
    "driving.mp4": os.path.join(ROOT, "videos", "driving.mp4"),
}

all_water_records = []

for v_name, v_path in videos.items():
    if not os.path.exists(v_path):
        print(f"Video {v_path} not found!")
        continue
    
    cap = cv2.VideoCapture(v_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"\nScanning {v_name}: {total_frames} frames ({duration:.1f}s), {fps:.1f} fps, {w}x{h}")

    # Dense sampling every 1.0 second across entire video
    sample_timestamps = [round(t, 2) for t in np.arange(0.5, duration - 0.5, 1.0)]

    for sec in sample_timestamps:
        fi = int(round(sec * fps))
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ret, frame = cap.read()
        if not ret or frame is None:
            continue
        
        # Resize to standard 1280x720 like in the pipeline
        resized = cv2.resize(frame, (1280, 720))
        fh, fw = resized.shape[:2]

        # Run hazard detection
        dets = hd.detect_hazards_in_frame(resized)
        water_dets = [d for d in dets if d["class"] == "waterlogging"]

        for w_idx, wd in enumerate(water_dets):
            bbox = wd["bboxPixels"] # [xmin, ymin, xmax, ymax]
            xmin, ymin, xmax, ymax = [int(round(b)) for b in bbox]
            
            # Clamp
            xmin_c = max(0, xmin)
            ymin_c = max(0, ymin)
            xmax_c = min(fw, xmax)
            ymax_c = min(fh, ymax)

            crop = resized[ymin_c:ymax_c, xmin_c:xmax_c]
            if crop.size == 0:
                continue

            crop_name = f"{v_name.replace('.mp4','')}_sec{sec:.1f}_f{fi}_w{w_idx}_conf{wd['confidence']}.jpg"
            crop_path = os.path.join(OUT_DIR, crop_name)
            art_crop_path = os.path.join(ARTIFACT_DIR, crop_name)
            cv2.imwrite(crop_path, crop)
            cv2.imwrite(art_crop_path, crop)

            # Also save full frame with annotated box
            annotated = resized.copy()
            cv2.rectangle(annotated, (xmin_c, ymin_c), (xmax_c, ymax_c), (255, 180, 0), 2)
            cv2.putText(
                annotated,
                f"WATERLOGGING {wd['confidence']}%",
                (xmin_c, max(20, ymin_c - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 180, 0),
                2
            )
            full_name = f"{v_name.replace('.mp4','')}_sec{sec:.1f}_f{fi}_full.jpg"
            full_path = os.path.join(OUT_DIR, full_name)
            art_full_path = os.path.join(ARTIFACT_DIR, full_name)
            cv2.imwrite(full_path, annotated)
            cv2.imwrite(art_full_path, annotated)

            # Analyze patch characteristics
            gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            hsv_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
            mean_val = float(np.mean(gray_crop))
            std_val = float(np.std(gray_crop))
            lap_var = float(np.var(cv2.Laplacian(gray_crop, cv2.CV_64F)))
            s_mean = float(np.mean(hsv_crop[:, :, 1]))
            v_mean = float(np.mean(hsv_crop[:, :, 2]))

            record = {
                "video": v_name,
                "timestampSec": sec,
                "frameIndex": fi,
                "confidence": wd["confidence"],
                "severity": wd["severity"],
                "bbox": [xmin, ymin, xmax, ymax],
                "cropWidth": xmax - xmin,
                "cropHeight": ymax - ymin,
                "cropFile": crop_name,
                "fullFile": full_name,
                "cropPath": crop_path,
                "artCropPath": art_crop_path,
                "meanBrightness": round(mean_val, 1),
                "stdBrightness": round(std_val, 1),
                "laplacianVariance": round(lap_var, 1),
                "satMean": round(s_mean, 1),
                "valMean": round(v_mean, 1),
            }
            all_water_records.append(record)

    cap.release()

# Save JSON log
log_path = os.path.join(OUT_DIR, "waterlogging_audit.json")
art_log_path = os.path.join(ARTIFACT_DIR, "waterlogging_audit.json")
with open(log_path, "w") as f:
    json.dump(all_water_records, f, indent=2)
with open(art_log_path, "w") as f:
    json.dump(all_water_records, f, indent=2)

print("\n" + "=" * 70)
print(f"TOTAL WATERLOGGING DETECTIONS FOUND: {len(all_water_records)}")
print("=" * 70)
for r in all_water_records:
    print(f"[{r['video']}] t={r['timestampSec']:4.1f}s | Conf: {r['confidence']:4.1f}% | Sev: {r['severity']:6s} | "
          f"Size: {r['cropWidth']}x{r['cropHeight']} | Mean: {r['meanBrightness']:4.1f} | LapVar: {r['laplacianVariance']:5.1f} | "
          f"Crop: {r['cropFile']}")
