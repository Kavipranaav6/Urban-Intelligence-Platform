import os
import yaml
from ultralytics import YOLO

print("=== Checking Models in ml/models ===")
for m in ['yolov8n.pt', 'hazard_yolov8.pt', 'pothole_yolov8.pt']:
    p = os.path.join('ml', 'models', m)
    if os.path.exists(p):
        try:
            model = YOLO(p)
            print(f"{m}: EXISTS (size: {os.path.getsize(p)} bytes)")
            print(f"   Classes: {model.names}")
        except Exception as e:
            print(f"{m}: Error loading: {e}")
    else:
        print(f"{m}: DOES NOT EXIST")

print("\n=== Checking incident_detector.py ===")
with open("ml/inference/incident_detector.py", "r", encoding="utf-8") as f:
    inc_content = f.read()
if "hazard" in inc_content.lower() or "pothole" in inc_content.lower() or "yolov8" in inc_content.lower():
    print("Found hazard references in incident_detector.py")
else:
    print("incident_detector.py contains NO hazard/pothole/yolov8 model loading (it handles Stage 4: Rash Driving & Hit-and-Run).")

print("\n=== Checking HazardDetector in hazard_detector.py ===")
from ml.inference.hazard_detector import HazardDetector
hd = HazardDetector()
print(f"HazardDetector is_available: {hd.is_available}")
print(f"HazardDetector model_path: {hd.model_path}")
print(f"HazardDetector models count: {len(hd.models)}")
for idx, mod in enumerate(hd.models):
    print(f"  Model {idx} classes: {getattr(mod, 'names', None)}")

print("\n=== Checking config.yaml (hazard section) ===")
with open("ml/inference/config.yaml", "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)
h_cfg = cfg.get("hazard", {})
print(f"conf_threshold: {h_cfg.get('conf_threshold')}")
print(f"roi: {h_cfg.get('roi')}")
print(f"model_path: {h_cfg.get('model_path')}")
print(f"pothole_model_path: {h_cfg.get('pothole_model_path')}")
print(f"frame_interval: {h_cfg.get('frame_interval')}")
