import cv2
from ml.inference.detector import YOLODetector
from ml.inference.incident_detector import IncidentDetector
from ml.inference.anpr_detector import ANPRDetector
from ml.inference.hazard_detector import HazardDetector

vd = YOLODetector('yolov8n.pt')
anpr = ANPRDetector()
inc_det = IncidentDetector(anpr_detector=anpr)
hazard_det = HazardDetector()

cap = cv2.VideoCapture('videos/driving.mp4')
fps = 30.0

target_frames = [0, 4, 8, 12, 16, 25, 40, 50, 60, 70, 80, 120, 160, 200, 240, 300, 360, 420, 480, 540, 600, 660, 720]
print(f"Testing {len(target_frames)} frames across full driving.mp4...")

hazard_tracker = hazard_det.create_tracker(bus_id="BUS-103")

for fi in target_frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        continue
    sec = fi / fps
    dets = vd.track_frame(frame, conf_threshold=0.25, persist=True)

    # Stage 3: Hazards
    for hd in hazard_det.detect_hazards_in_frame(frame):
        hazard_tracker.add_or_update_detection(
            hazard_class=hd["class"],
            confidence=hd["confidence"],
            severity=hd["severity"],
            timestamp_sec=sec,
            frame_index=fi,
            bbox=hd["bboxPixels"],
            frame=frame
        )

    # Stage 4: Incidents
    inc_det.update_frame(
        frame_idx=fi,
        timestamp_sec=sec,
        detections=dets,
        frame_width=frame.shape[1],
        frame_height=frame.shape[0],
        raw_frame=frame
    )

    # ANPR on vehicles
    for d in dets:
        cls = d.get('class', '').lower()
        if cls in ('car', 'motorcycle', 'truck', 'bus'):
            bbox = d.get('bboxPixels', [])
            if bbox and len(bbox) == 4 and (bbox[2] - bbox[0] >= 20) and (bbox[3] - bbox[1] >= 15):
                anpr.extract_registration(
                    frame=frame,
                    vehicle_bbox=bbox,
                    track_id=d.get('track_id', -1),
                    timestamp_sec=sec,
                    vehicle_class=cls
                )

cap.release()

hazards = hazard_tracker.get_summary()
safety = inc_det.get_summary()

print("\n--- HAZARDS ---")
for h in hazards['incidents']:
    print(f"  Hazard {h['id']}: {h['type']} ({h['severity']}) @ {h['timestampFormatted']}")

print("\n--- SAFETY INCIDENTS (RASH / HIT-AND-RUN) ---")
for s in safety['incidents']:
    print(f"  Safety {s['id']}: {s['type']} | Track {s['trackId']} | Plate: '{s.get('plateNumber')}' | {s['vehicleClass']} ({s['severity']}) @ {s['timestampFormatted']}")

print("\n--- ANPR CONSENSUS ---")
for tid in sorted(anpr.track_readings.keys()):
    cons = anpr.get_track_consensus_plate(tid)
    if cons and cons.get('plateNumber'):
        print(f"  Track {tid}: Plate '{cons['plateNumber']}' (conf {cons['confidence']:.1f}%, readable={cons.get('readable')})")
