import cv2
import os
from ml.inference.detector import YOLODetector
from ml.inference.incident_detector import IncidentDetector
from ml.inference.anpr_detector import ANPRDetector

vd = YOLODetector('yolov8n.pt')
anpr = ANPRDetector()
inc_det = IncidentDetector(anpr_detector=anpr)

cap = cv2.VideoCapture('videos/driving.mp4')
fps = 30.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

print(f"Tracking driving.mp4 across frames with step=5 (total {total} frames)...")
frame_indices = list(range(0, total, 5))
frames = []
all_dets = []
for fi in frame_indices:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret:
        break
    dets = vd.track_frame(frame, conf_threshold=0.25, persist=True)
    frames.append(frame)
    all_dets.append(dets)

cap.release()

print(f"Done tracking {len(frames)} frames. Running incident detector update_frame...")
incidents_found = []
for i, (fi, frame, dets) in enumerate(zip(frame_indices, frames, all_dets)):
    sec = fi / fps
    new_inc = inc_det.update_frame(
        frame_idx=fi,
        timestamp_sec=sec,
        detections=dets,
        frame_width=frame.shape[1],
        frame_height=frame.shape[0],
        raw_frame=frame
    )
    if new_inc:
        for inc in new_inc:
            print(f"Frame {fi} ({sec:.2f}s): INCIDENT -> ID={inc['id']} Type={inc['type']} Track={inc['trackId']} Vehicle={inc['vehicleClass']}")
            incidents_found.append(inc)

summary = inc_det.get_summary()
print(f"Total incidents from incident detector: {len(summary['incidents'])}")
for inc in summary['incidents']:
    print("Summary Incident:", inc['id'], inc['type'], inc['trackId'], inc.get('plateNumber'))
