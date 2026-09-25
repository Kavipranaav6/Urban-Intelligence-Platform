import cv2
from ml.inference.detector import YOLODetector
from ml.inference.incident_detector import IncidentDetector
from ml.inference.anpr_detector import ANPRDetector

vd = YOLODetector('yolov8n.pt')
cap = cv2.VideoCapture('videos/driving.mp4')
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

inc_det = IncidentDetector(anpr_detector=ANPRDetector())

print(f"Tracking with step=2 across {total} frames...")
for fi in range(0, total, 2):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        break
    sec = fi / 30.0
    dets = vd.track_frame(frame, conf_threshold=0.25, persist=True)
    incidents = inc_det.update_frame(
        frame_idx=fi,
        timestamp_sec=sec,
        detections=dets,
        frame_width=frame.shape[1],
        frame_height=frame.shape[0],
        raw_frame=frame
    )
    if incidents:
        for inc in incidents:
            print(f"*** FI {fi} ({sec:.2f}s): {inc['id']} | {inc['type']} | Track {inc['trackId']} | {inc['vehicleClass']} | Plate: {inc.get('plateNumber')} ***")

summary = inc_det.get_summary()
print("\nFinal Incidents Summary:")
for inc in summary['incidents']:
    print(f"  {inc['id']}: {inc['type']} | Track {inc['trackId']} | Plate: {inc.get('plateNumber')} | Severity: {inc['severity']}")
