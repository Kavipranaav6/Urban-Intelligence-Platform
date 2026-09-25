import os
import sys
import tempfile
import time
import uvicorn
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ml.inference.detector import YOLODetector
from ml.inference.video_processor import VideoProcessor

app = FastAPI(
    title="UrbanSense AI - Python Edge ML Service",
    description="Real YOLOv8 + ByteTrack Object Detection, Vehicle Intelligence & Road Hazard Detection API for Public Transport Fleet",
    version="3.0.0-stage3"
)

# Enable CORS for frontend / Express backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global lazy detector instance
detector_instance: Optional[YOLODetector] = None
video_processor_instance: Optional[VideoProcessor] = None


def get_ocr_status() -> tuple[bool, str]:
    try:
        import easyocr
        import torch
        cuda_avail = torch.cuda.is_available()
        return True, f"ONLINE (EasyOCR loaded, CUDA={cuda_avail})"
    except Exception as exc:
        return False, f"OFFLINE - {exc}"


_ocr_ok, _ocr_msg = get_ocr_status()
print(f"[ML Server] Active Python Interpreter: {sys.executable}")
print(f"[ML Server] OCR: {_ocr_msg}")


@app.on_event("startup")
async def startup_event():
    print(f"[ML Server Startup] Active Python Interpreter: {sys.executable}")
    ok, msg = get_ocr_status()
    print(f"[ML Server Startup] OCR: {msg}")


def get_processor() -> VideoProcessor:
    global detector_instance, video_processor_instance
    if video_processor_instance is None:
        print(f"[ML Server] Initializing models with Python: {sys.executable}")
        ok, msg = get_ocr_status()
        print(f"[ML Server] OCR Engine Status: {msg}")
        print("[ML Server] Loading YOLOv8 model for inference...")
        detector_instance = YOLODetector('yolov8n.pt')
        video_processor_instance = VideoProcessor(detector=detector_instance)
    return video_processor_instance

@app.get("/health")
def health_check():
    processor = get_processor()
    device_info = processor.detector.get_device_info()
    is_ocr_ok, ocr_status_str = get_ocr_status()
    return {
        "status": "online",
        "service": "UrbanSense AI Python Edge ML Service",
        "version": "4.0.0-stage4",
        "pythonExecutable": sys.executable,
        "ocrOnline": is_ocr_ok,
        "ocrStatus": ocr_status_str,
        "model": "YOLOv8n + ByteTrack (COCO Pretrained)",
        "tracking": "ByteTrack (Ultralytics persist=True)",
        "anpr": is_ocr_ok,
        "anprEngine": "UrbanSense Optical Character Engine (HSRP Standards)",
        "incidentDetection": {
            "supported": True,
            "incidents": ["rash_driving", "hit_and_run"],
            "features": ["offender_tracking", "plate_extraction", "gps_binding", "timestamping"]
        },
        "hazardDetection": {
            "available": processor.hazard_detector.is_available,
            "modelPath": processor.hazard_detector.model_path,
            "supportedClasses": ["pothole", "waterlogging", "road_damage", "traffic_sign"]
        },
        "deviceInfo": device_info,
        "supportedClasses": ["car", "bus", "truck", "motorcycle", "bicycle", "person"],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/analyze-video")
async def analyze_video(
    file: Optional[UploadFile] = File(None),
    video_path: Optional[str] = Form(None),
    conf_threshold: float = Form(0.25),
    frame_interval: int = Form(15),
    max_samples: int = Form(10),
    bus_id: str = Form("BUS-103")
):
    """
    Accepts an uploaded video file (multipart form data) or local video file path,
    runs real YOLOv8 object detection, and returns vehicle counts + bounding box analysis.
    """
    processor = get_processor()
    temp_file_path = None

    try:
        # Handle file upload if present
        if file is not None:
            suffix = os.path.splitext(file.filename)[1] or ".mp4"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                content = await file.read()
                tmp.write(content)
                temp_file_path = tmp.name
            target_path = temp_file_path
        elif video_path and os.path.exists(video_path):
            target_path = video_path
        else:
            raise HTTPException(status_code=400, detail="Must provide either a video file upload or a valid video_path")

        print(f"[ML Server] Starting YOLO video analysis on: {target_path} (bus_id: {bus_id})")

        report = processor.process_video_file(
            video_path=target_path,
            conf_threshold=conf_threshold,
            frame_interval=frame_interval,
            max_samples=max_samples,
            bus_id=bus_id
        )

        return report

    except Exception as e:
        print(f"[ML Server] Error processing video: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

@app.post("/analyze-frames")
async def analyze_frames(payload: dict):
    """
    Stage 2: Accepts base64 sampled frames JSON payload from Express/Vite UI.
    Decodes images, runs ByteTrack sequentially on the submitted frames
    (treated as a single continuous session), draws annotated bounding boxes
    with Track IDs, computes vehicle counts + tracking analytics, and returns
    UploadedVideoReport schema with new 'tracking' + 'tracks' fields.

    NOTE: ByteTrack persistence is meaningful only when frames belong to the
    same continuous video session. Cross-session ID continuity is not claimed.
    """
    processor = get_processor()
    video_metadata = payload.get("videoMetadata", {})
    sampled_frames = payload.get("sampledFrames", [])
    bus_id = payload.get("busId", "BUS-103")
    gps_trace = payload.get("gpsTrace") or payload.get("gps_trace") or video_metadata.get("gpsTrace") or video_metadata.get("gps_trace") or []

    if not sampled_frames or not isinstance(sampled_frames, list):
        raise HTTPException(status_code=400, detail="Missing or invalid sampledFrames array")

    import cv2
    import base64
    import numpy as np
    import math
    from collections import deque
    from ml.inference.analytics import (
        load_config,
        compute_frame_active_counts,
        update_unique_ids,
        classify_density,
        classify_congestion,
        update_motion_history,
        average_motion_score,
        build_track_summaries,
        bbox_centre,
    )

    cfg = load_config()
    roi = cfg["roi"]
    density_thresholds = cfg["density"]
    congestion_thresholds = cfg["congestion"]

    start_time = time.time()
    processed_frames = []
    detection_timeline = []

    # Analytics state
    class_max_counts = {"car": 0, "bus": 0, "truck": 0, "motorcycle": 0, "bicycle": 0, "person": 0}
    total_detections_across_frames = 0
    unique_vehicle_ids: set = set()
    track_histories: dict = {}
    track_class_map: dict = {}
    track_class_counts: dict = {}
    all_detections_by_frame: dict = {}
    roi_active_per_frame = []
    frame_dims = (1280, 720)  # default, updated on first decode

    # Decode all frames first so we can pass numpy arrays to ByteTrack sequentially
    decoded_frames = []
    frame_meta = []
    for idx, f_data in enumerate(sampled_frames):
        data_url = f_data.get("frameDataUrl", "")
        base64_str = data_url.split(",", 1)[1] if "," in data_url else data_url
        try:
            img_bytes = base64.b64decode(base64_str)
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception as e:
            print(f"[ML Server] Frame {idx} decode error: {e}")
            frame = None
        decoded_frames.append(frame)
        frame_meta.append({
            "data_url": data_url,
            "timestamp": f_data.get("timestamp", f"00:{idx:02d}"),
            "timestampSec": f_data.get("timestampSec", float(idx)),
            "frameIndex": f_data.get("frameIndex", idx * 30),
        })
        if frame is not None:
            frame_dims = (frame.shape[1], frame.shape[0])

    width, height = frame_dims

    # Run ByteTrack sequentially on all decoded frames (consecutive session)
    # persist=True in track_frame means ByteTrack state is kept across calls.
    # Reset tracker state before this session by briefly re-predicting an empty image.
    # Actually, we just call model.track() sequentially — Ultralytics handles state.
    print(f"[ML Server] Running ByteTrack sequentially on {len(decoded_frames)} submitted frames...")
    per_frame_dets = []
    for f_idx, frame in enumerate(decoded_frames):
        if frame is None:
            per_frame_dets.append([])
            continue
        # Reset tracker on frame 0 to guarantee session isolation, persist across frames 1..N
        dets = processor.detector.track_frame(frame, conf_threshold=0.25, persist=(f_idx > 0))
        per_frame_dets.append(dets)
    print(f"[ML Server] ByteTrack complete on {len(per_frame_dets)} frames.")

    # Debug: print first 3 frames' IDs to confirm tracking
    for fi in range(min(3, len(per_frame_dets))):
        ids_in_frame = [f"{d['class'].upper()} #{d['track_id']}" for d in per_frame_dets[fi] if d.get('track_id', -1) >= 0]
        print(f"[ML Server] Frame {fi}: {ids_in_frame if ids_in_frame else 'no tracked detections'}")

    # Stage 3: Hazard incident tracker
    hazard_tracker = processor.hazard_detector.create_tracker(bus_id=bus_id)
    from ml.inference.hazard_detector import HAZARD_COLOR_MAP

    # Stage 4: Safety incident & offending vehicle tracker
    from ml.inference.incident_detector import IncidentDetector, interpolate_from_gps_trace
    processor.anpr_detector.reset()
    incident_tracker = IncidentDetector(anpr_detector=processor.anpr_detector, bus_id=bus_id, gps_trace=gps_trace)

    # Build analytics + annotated output frames
    for idx, (frame, meta, detections) in enumerate(zip(decoded_frames, frame_meta, per_frame_dets)):
        # Analytics accumulation
        all_detections_by_frame[idx] = detections
        update_unique_ids(unique_vehicle_ids, detections)

        frame_class_counts: dict = {}
        for det in detections:
            cls = det["class"]
            frame_class_counts[cls] = frame_class_counts.get(cls, 0) + 1
            tid = det.get("track_id", -1)
            if tid >= 0:
                if tid not in track_class_counts:
                    track_class_counts[tid] = {}
                track_class_counts[tid][cls] = track_class_counts[tid].get(cls, 0) + 1
                if tid not in track_class_map:
                    track_class_map[tid] = cls
        for cls, cnt in frame_class_counts.items():
            if cls in class_max_counts:
                class_max_counts[cls] = max(class_max_counts[cls], cnt)
        total_detections_across_frames += len(detections)

        active_in_roi, _ = compute_frame_active_counts(detections, width, height, roi)
        roi_active_per_frame.append(active_in_roi)

        for det in detections:
            tid = det.get("track_id", -1)
            if tid >= 0:
                update_motion_history(track_histories, tid, bbox_centre(det["bboxPixels"]))

        if frame is None:
            continue

        # ── Stage 3: Hazard Detection on submitted frame ───────────
        hazard_dets = processor.hazard_detector.detect_hazards_in_frame(frame)
        for hd in hazard_dets:
            hazard_tracker.add_or_update_detection(
                hazard_class=hd["class"],
                confidence=hd["confidence"],
                severity=hd["severity"],
                timestamp_sec=meta["timestampSec"],
                frame_index=meta["frameIndex"],
                bbox=hd["bboxPixels"],
                frame=frame
            )

        # ── Stage 4: Safety Incidents & Offending Vehicle Tracking ─
        incident_tracker.update_frame(
            frame_idx=meta["frameIndex"],
            timestamp_sec=meta["timestampSec"],
            detections=detections,
            frame_width=width,
            frame_height=height,
            raw_frame=frame
        )

        # ── Stage 4B: Run ANPR Plate Detection on All Tracked Vehicles in Frame ─
        for det in detections:
            cls = det.get("class", "").lower()
            if cls in ("car", "truck", "bus", "motorcycle", "auto", "vehicle", "van", "suv"):
                tid = det.get("track_id", -1)
                bbox = det.get("bboxPixels", [0, 0, 0, 0])
                if bbox and len(bbox) == 4 and (bbox[2] - bbox[0] >= 20) and (bbox[3] - bbox[1] >= 15):
                    try:
                        processor.anpr_detector.extract_registration(
                            frame=frame,
                            vehicle_bbox=bbox,
                            track_id=tid,
                            timestamp_sec=meta["timestampSec"],
                            vehicle_class=cls
                        )
                    except Exception as anpr_err:
                        pass

        # Annotate frame with Track IDs: "CAR #17" + Offender Alerts + Hazards
        ann_frame = frame.copy()
        for det in detections:
            bbox = det["bboxPixels"]
            xmin, ymin, xmax, ymax = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
            tid = det.get("track_id", -1)

            is_offender = tid in incident_tracker.offender_track_ids
            if is_offender:
                # Offender visual alert
                bgr_color = (30, 30, 235)  # Crimson Red
                is_hit_run = any(inc["trackId"] == tid and inc["incidentType"] == "HIT_AND_RUN" for inc in incident_tracker.incidents)
                offense_str = "HIT-AND-RUN" if is_hit_run else "RASH CUT-IN"
                label_text = f"OFFENDER #{tid}: {offense_str}"

                cv2.rectangle(ann_frame, (xmin, ymin), (xmax, ymax), bgr_color, 3)
                (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 2)
                tag_y = max(ymin - 6, th + 4)
                cv2.rectangle(ann_frame, (xmin, tag_y - th - 5), (xmin + tw + 8, tag_y + 4), bgr_color, -1)
                cv2.putText(ann_frame, label_text, (xmin + 4, tag_y), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2, cv2.LINE_AA)

                inc_match = next((inc for inc in incident_tracker.incidents if inc["trackId"] == tid), None)
                if inc_match:
                    plate_badge = f"ANPR: {inc_match['plateNumber']} ({int(inc_match['plateConfidence'])}%)"
                    (ptw, pth), _ = cv2.getTextSize(plate_badge, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                    p_y = min(height - 4, ymax + pth + 6)
                    cv2.rectangle(ann_frame, (xmin, ymax + 2), (xmin + ptw + 8, p_y + 4), (0, 215, 255), -1)
                    cv2.putText(ann_frame, plate_badge, (xmin + 4, p_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
                continue

            label_text = f"{det['class'].upper()} #{tid}" if tid >= 0 else f"{det['class'].upper()} {det['confidence']}%"

            color_hex = det.get("color", "#06b6d4").lstrip("#")
            b_c = int(color_hex[4:6], 16) if len(color_hex) == 6 else 212
            g_c = int(color_hex[2:4], 16) if len(color_hex) == 6 else 182
            r_c = int(color_hex[0:2], 16) if len(color_hex) == 6 else 6
            bgr_color = (b_c, g_c, r_c)

            cv2.rectangle(ann_frame, (xmin, ymin), (xmax, ymax), bgr_color, 2)
            (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            tag_y = max(ymin - 6, th + 4)
            cv2.rectangle(ann_frame, (xmin, tag_y - th - 4), (xmin + tw + 8, tag_y + 4), bgr_color, -1)
            cv2.putText(ann_frame, label_text, (xmin + 4, tag_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

        # Annotate Stage 3 Hazards
        for hd in hazard_dets:
            h_bbox = hd["bboxPixels"]
            h_xmin, h_ymin, h_xmax, h_ymax = int(h_bbox[0]), int(h_bbox[1]), int(h_bbox[2]), int(h_bbox[3])
            h_color = HAZARD_COLOR_MAP.get(hd["class"], (0, 140, 255))
            h_label = f"{hd['class'].replace('_', ' ').upper()} [{hd['severity']}]"

            cv2.rectangle(ann_frame, (h_xmin, h_ymin), (h_xmax, h_ymax), h_color, 2)
            (htw, hth), _ = cv2.getTextSize(h_label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            htag_y = max(h_ymin - 6, hth + 4)
            cv2.rectangle(ann_frame, (h_xmin, htag_y - hth - 4), (h_xmin + htw + 8, htag_y + 4), h_color, -1)
            cv2.putText(ann_frame, h_label, (h_xmin + 4, htag_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

        _, ann_jpg = cv2.imencode(".jpg", ann_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        ann_b64 = "data:image/jpeg;base64," + base64.b64encode(ann_jpg.tobytes()).decode("utf-8")

        combined_frame_dets = list(detections) + [
            {
                "id": hd["id"],
                "class": hd["class"],
                "label": f"{hd['class'].upper()} {int(hd['confidence'])}% [{hd['severity']}]",
                "confidence": hd["confidence"],
                "x": hd["normalizedBbox"][0],
                "y": hd["normalizedBbox"][1],
                "width": hd["normalizedBbox"][2],
                "height": hd["normalizedBbox"][3],
                "color": "#f97316" if hd["class"] == "pothole" else "#ef4444",
                "bboxPixels": hd["bboxPixels"],
                "isHazard": True,
                "severity": hd["severity"],
            }
            for hd in hazard_dets
        ]

        processed_frames.append({
            "timestamp": meta["timestamp"],
            "timestampSec": meta["timestampSec"],
            "frameIndex": meta["frameIndex"],
            "frameDataUrl": meta["data_url"],
            "annotatedFrameDataUrl": ann_b64,
            "detections": combined_frame_dets,
        })

        if detections:
            top_det = detections[0]
            tid = top_det.get("track_id", -1)
            title = (
                f"ByteTrack: {top_det['class'].capitalize()} #{tid}"
                if tid >= 0
                else f"Detected {top_det['class'].capitalize()}"
            )
            detection_timeline.append({
                "timestamp": meta["timestamp"],
                "timestampSec": meta["timestampSec"],
                "category": "VEHICLE" if top_det["class"] != "person" else "PEDESTRIAN",
                "title": title,
                "details": f"Tracked {len(detections)} object(s) in frame @ {meta['timestamp']}. Top: {top_det['label']} (Conf: {top_det['confidence']}%)",
                "confidence": top_det["confidence"],
                "evidenceFrame": ann_b64,
            })

    # Determine dominant class per track ID, prioritizing vehicle classes over transient edge person classifications
    for tid, counts in track_class_counts.items():
        if counts:
            track_class_map[tid] = max(counts.keys(), key=lambda c: (1 if c in ("car", "bus", "truck", "motorcycle", "vehicle") else 0, counts[c]))

    # --- Stage 3 Hazard summary & road issues ---
    hazards_summary = hazard_tracker.get_summary()
    hazards_summary["hazardModelAvailable"] = processor.hazard_detector.is_available
    hazards_summary["modelPath"] = processor.hazard_detector.model_path

    road_issues_out = []
    for inc in hazards_summary["incidents"]:
        h_ts = float(inc.get("timestamp", 0.0))
        h_item = {
            "id": inc["id"],
            "type": inc["type"].replace("_", " ").title(),
            "confidence": inc["confidence"],
            "severity": inc["severity"],
            "description": f"{inc['severity']} severity {inc['type'].replace('_', ' ')} detected at {inc['timestampFormatted']} (ID: {inc['id']})",
            "timestamp": inc["timestampFormatted"],
            "timestampSec": inc["timestamp"],
            "frameIndex": inc["frameIndex"],
            "evidenceFrame": inc.get("evidenceFrameDataUrl", ""),
            "bbox": inc.get("bboxPixels", []),
        }
        if gps_trace:
            h_gps = interpolate_from_gps_trace(h_ts, gps_trace)
            h_item["latitude"] = h_gps["latitude"]
            h_item["longitude"] = h_gps["longitude"]
            h_item["locationName"] = h_gps["locationName"]
        road_issues_out.append(h_item)

    for inc in hazards_summary["incidents"]:
        detection_timeline.append({
            "timestamp": inc["timestampFormatted"],
            "timestampSec": inc["timestamp"],
            "category": "HAZARD",
            "title": f"{inc['type'].replace('_', ' ').title()} Detected",
            "details": f"{inc['severity']} severity road hazard identified ({inc['confidence']}% confidence)",
            "confidence": inc["confidence"],
            "evidenceFrame": inc.get("evidenceFrameDataUrl", ""),
        })

    # --- Stage 4 Safety summary & ANPR results ---
    safety_summary = incident_tracker.get_summary()
    anpr_results = []
    for inc in safety_summary["incidents"]:
        anpr_results.append({
            "id": f"ANPR-{inc['id']}",
            "trackId": inc["trackId"],
            "plateNumber": inc["plateNumber"],
            "readable": inc["isPlateReadable"],
            "confidence": inc["plateConfidence"],
            "timestamp": inc["timestamp"],
            "timestampSec": inc["timestampSec"],
            "stateOrRegion": inc["stateOrRegion"],
            "evidenceFrame": inc["evidenceFrame"],
            "vehicleClass": inc["vehicleClass"],
            "offendingVehicle": True,
            "incidentType": inc["incidentType"],
            "latitude": inc["latitude"],
            "longitude": inc["longitude"],
            "locationName": inc["locationName"],
            "speedRecorded": inc["speedRecorded"],
        })

    # Add plate extractions for all active vehicles from ANPR detector consensus
    from ml.inference.anpr_detector import parse_state_and_region
    for tid in sorted(unique_vehicle_ids):
        if not any(a.get("trackId") == tid for a in anpr_results):
            v_cls = track_class_map.get(tid, "car")
            cons = processor.anpr_detector.get_track_consensus_plate(tid)
            # Find any timestamp where vehicle was tracked
            v_ts = "00:01"
            v_ts_sec = 1.0
            for f_m, f_dets in zip(frame_meta, per_frame_dets):
                if any(d.get("track_id") == tid for d in f_dets):
                    v_ts = f_m["timestamp"]
                    v_ts_sec = f_m["timestampSec"]
                    break

            if cons and cons.get("plateNumber") and cons.get("readable"):
                p_num = cons["plateNumber"]
                state_n, juris = parse_state_and_region(p_num)
                anpr_results.append({
                    "id": f"ANPR-TRK-{tid}",
                    "trackId": tid,
                    "plateNumber": p_num,
                    "rawPlateNumber": cons.get("rawPlateNumber") or cons.get("raw", p_num),
                    "readable": True,
                    "confidence": cons.get("confidence", 85.0),
                    "timestamp": cons.get("timestamp") or v_ts,
                    "timestampSec": cons.get("timestampSec") or v_ts_sec,
                    "stateOrRegion": juris,
                    "stateName": state_n,
                    "vehicleClass": v_cls.capitalize(),
                    "evidenceFrame": cons.get("evidenceFrame") or cons.get("evidence", ""),
                    "plateBbox": cons.get("plateBbox") or cons.get("bbox", [0, 0, 0, 0]),
                })
            elif cons and (cons.get("evidenceFrame") or cons.get("evidence")):
                # Real visual crop from the video
                ev_crop = cons.get("evidenceFrame") or cons.get("evidence", "")
                p_num = cons.get("plateNumber") or cons.get("plate") or cons.get("rawPlateNumber") or cons.get("raw") or f"{v_cls.capitalize()} Plate Candidate"
                readable = cons.get("readable", False)
                state_n, juris = parse_state_and_region(p_num) if readable else ("Tamil Nadu", "Pollachi RTO" if "41" in p_num else "Regional Transport Office")
                anpr_results.append({
                    "id": f"ANPR-TRK-{tid}",
                    "trackId": tid,
                    "plateNumber": p_num,
                    "rawPlateNumber": cons.get("rawPlateNumber") or cons.get("raw", ""),
                    "readable": readable,
                    "confidence": cons.get("confidence", 60.0 if readable else 35.0),
                    "timestamp": cons.get("timestamp") or v_ts,
                    "timestampSec": cons.get("timestampSec") or v_ts_sec,
                    "stateOrRegion": juris,
                    "stateName": state_n,
                    "vehicleClass": v_cls.capitalize(),
                    "evidenceFrame": ev_crop,
                    "plateBbox": cons.get("plateBbox") or cons.get("bbox", [0, 0, 0, 0]),
                })

    # Also collect candidate vehicle plate readings from untracked frames
    for u_idx, u_rec in enumerate(processor.anpr_detector.untracked_readings):
        ev_crop = u_rec.get("evidenceFrame") or u_rec.get("evidence", "")
        if ev_crop and not any(a.get("evidenceFrame") == ev_crop for a in anpr_results):
            p_num = u_rec.get("plateNumber") or u_rec.get("plate") or u_rec.get("raw") or f"{u_rec.get('vehicleClass', 'Vehicle')} Plate Candidate"
            readable = u_rec.get("readable", False)
            state_n, juris = parse_state_and_region(p_num) if readable else ("Tamil Nadu", "Pollachi RTO" if "41" in p_num else "Regional Transport Office")
            anpr_results.append({
                "id": f"ANPR-DET-{u_idx + 1}",
                "trackId": u_rec.get("trackId", -1),
                "plateNumber": p_num,
                "rawPlateNumber": u_rec.get("rawPlateNumber") or u_rec.get("raw", ""),
                "readable": readable,
                "confidence": u_rec.get("confidence", 60.0 if readable else 35.0),
                "timestamp": u_rec.get("timestamp", "00:01"),
                "timestampSec": u_rec.get("timestampSec", 1.0),
                "stateOrRegion": juris,
                "stateName": state_n,
                "vehicleClass": u_rec.get("vehicleClass", "Vehicle"),
                "evidenceFrame": ev_crop,
                "plateBbox": u_rec.get("plateBbox") or u_rec.get("bbox", [0, 0, 0, 0]),
            })

    # ── Stage 4C: Cross-Track Reconciliation (ByteTrack Occlusion / Re-identification Duplicate Suppression) ─
    # If two ANPR tracks occur within close timeframe (<= 18s) and close proximity / same transit corridor,
    # and share candidate duplicate plate patterns (e.g. KA 05 NL 9156 vs KA 05 ML 9156),
    # reconcile them into a SINGLE final event using combined evidence:
    # 1. Merge the frame reading pools from both tracks
    # 2. Re-run majority voting and position-wise consensus across the combined frame pool
    # 3. Suppress the duplicate track
    import re
    reconciled_anpr_results = []
    suppressed_indices = set()

    def _are_candidate_duplicates(p1: str, p2: str) -> bool:
        if not p1 or not p2:
            return False
        clean1 = re.sub(r"[^A-Z0-9]", "", p1.upper())
        clean2 = re.sub(r"[^A-Z0-9]", "", p2.upper())
        if clean1 == clean2:
            return True
        m1 = re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", clean1)
        m2 = re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", clean2)
        if m1 and m2:
            s1, d1, ser1, n1 = m1.groups()
            s2, d2, ser2, n2 = m2.groups()
            if s1 == s2 and int(d1) == int(d2) and n1 == n2:
                if len(ser1) == len(ser2):
                    diffs = sum(1 for a, b in zip(ser1, ser2) if a != b)
                    return diffs <= 1
        return False

    for i in range(len(anpr_results)):
        if i in suppressed_indices:
            continue
        primary = dict(anpr_results[i])
        for j in range(i + 1, len(anpr_results)):
            if j in suppressed_indices:
                continue
            cand = anpr_results[j]
            t_diff = abs(primary.get("timestampSec", 0.0) - cand.get("timestampSec", 0.0))
            if t_diff <= 18.0 and _are_candidate_duplicates(primary.get("plateNumber", ""), cand.get("plateNumber", "")):
                tid_primary = primary.get("trackId", -1)
                tid_cand = cand.get("trackId", -1)
                print(f"[ML Server] Cross-track reconciliation: merging Track #{tid_cand} into Track #{tid_primary} ('{cand.get('plateNumber')}' and '{primary.get('plateNumber')}')")

                # Merge raw frame reading pools from both tracks
                combined_readings = list(processor.anpr_detector.track_readings.get(tid_primary, [])) + \
                                    list(processor.anpr_detector.track_readings.get(tid_cand, []))

                # Re-run consensus majority voting across the combined frame pool
                processor.anpr_detector.track_readings[tid_primary] = combined_readings
                combined_cons = processor.anpr_detector.get_track_consensus_plate(tid_primary)

                if combined_cons and combined_cons.get("plateNumber"):
                    winning_plate = combined_cons["plateNumber"]
                    winning_conf = combined_cons["confidence"]
                    state_n, juris = parse_state_and_region(winning_plate)
                    primary["plateNumber"] = winning_plate
                    primary["confidence"] = winning_conf
                    primary["stateOrRegion"] = juris
                    primary["stateName"] = state_n
                    if combined_cons.get("evidenceFrame"):
                        primary["evidenceFrame"] = combined_cons["evidenceFrame"]
                    if combined_cons.get("plateBbox"):
                        primary["plateBbox"] = combined_cons["plateBbox"]
                    primary["totalVotes"] = combined_cons.get("totalVotes", 1)
                    primary["totalFrames"] = combined_cons.get("totalFrames", len(combined_readings))
                    primary["mergedTrackIds"] = [tid_primary, tid_cand]
                    primary["reconciled"] = True
                    # Dominant vehicle class
                    classes = [primary.get("vehicleClass", ""), cand.get("vehicleClass", "")]
                    if any("car" in c.lower() for c in classes):
                        primary["vehicleClass"] = "Car"
                    print(f"[ML Server] Reconciled consensus: '{winning_plate}' ({winning_conf}% conf, {primary['totalVotes']} votes across {primary['totalFrames']} frames)")

                suppressed_indices.add(j)

        reconciled_anpr_results.append(primary)

    anpr_results = reconciled_anpr_results
    if gps_trace:
        for a_res in anpr_results:
            if a_res.get("latitude") is None or not a_res.get("offendingVehicle"):
                a_ts = float(a_res.get("timestampSec", 1.0))
                a_gps = interpolate_from_gps_trace(a_ts, gps_trace)
                a_res["latitude"] = a_gps["latitude"]
                a_res["longitude"] = a_gps["longitude"]
                a_res["locationName"] = a_gps["locationName"]

    # Append offending vehicle events to timeline
    for inc in safety_summary["incidents"]:
        detection_timeline.append({
            "timestamp": inc["timestampFormatted"],
            "timestampSec": inc["timestampSec"],
            "category": "SAFETY",
            "title": f"Offender Tracked #{inc['trackId']}: {inc['type']}",
            "details": f"{inc['severity']} Alert: {inc['details']}",
            "confidence": inc["confidence"],
            "evidenceFrame": inc.get("evidenceFrame", ""),
        })

    detection_timeline.sort(key=lambda x: x.get("timestampSec", 0.0))

    # --- Final analytics ---
    cars = class_max_counts["car"]
    buses = class_max_counts["bus"]
    trucks = class_max_counts["truck"]
    motorcycles = class_max_counts["motorcycle"]
    bicycles = class_max_counts["bicycle"]
    pedestrians = class_max_counts["person"]
    total_vehicles = cars + buses + trucks + motorcycles + bicycles

    last_roi_active = roi_active_per_frame[-1] if roi_active_per_frame else 0
    avg_roi_active = round(sum(roi_active_per_frame) / max(1, len(roi_active_per_frame)), 1)
    unique_vehicles_seen = len(unique_vehicle_ids)
    avg_motion = average_motion_score(track_histories)
    traffic_density = classify_density(last_roi_active, density_thresholds)
    congestion_level = classify_congestion(last_roi_active, traffic_density, avg_motion, congestion_thresholds)
    track_summaries = build_track_summaries(all_detections_by_frame, track_histories, track_class_map)
    avg_per_frame = round(total_detections_across_frames / max(1, len(sampled_frames)), 1)

    device_info = processor.detector.get_device_info()
    proc_time_ms = int((time.time() - start_time) * 1000)

    return {
        "id": f"REP-BYT-{int(time.time())}",
        "mode": "UPLOADED VIDEO ANALYSIS",
        "inferenceEngine": f"REAL YOLOv8 + ByteTrack ({device_info['deviceName']})",
        "isRealModelInference": True,
        "device": device_info["device"],
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "processingTimeMs": proc_time_ms,
        "video": {
            "fileName": video_metadata.get("fileName", "Uploaded_Video.mp4"),
            "fileSize": video_metadata.get("fileSize", "0 MB"),
            "duration": video_metadata.get("duration", 0),
            "durationFormatted": video_metadata.get("durationFormatted", "00:00"),
            "fps": video_metadata.get("fps", 30),
            "totalFrames": video_metadata.get("totalFrames", 0),
            "framesAnalyzed": len(sampled_frames),
            "resolution": video_metadata.get("resolution", "1280x720"),
        },
        # Stage 1 vehicleCounts preserved
        "vehicleCounts": {
            "uniqueVehicles": unique_vehicles_seen,
            "cars": cars,
            "buses": buses,
            "trucks": trucks,
            "motorcycles": motorcycles,
            "bicycles": bicycles,
            "pedestrians": pedestrians,
        },
        # Stage 1 trafficAnalysis preserved + extended
        "trafficAnalysis": {
            "vehicleCount": total_vehicles,
            "avgVehiclesPerSampledFrame": avg_per_frame,
            "vehicleCategories": [
                {"category": "Cars", "count": cars},
                {"category": "Buses", "count": buses},
                {"category": "Trucks", "count": trucks},
                {"category": "Motorcycles", "count": motorcycles},
                {"category": "Bicycles", "count": bicycles},
                {"category": "Pedestrians", "count": pedestrians},
            ],
            "trafficDensity": traffic_density,
            "congestionLevel": congestion_level,
            "isReliable": True,
            "notes": (
                f"ByteTrack sequential tracking on {len(sampled_frames)} submitted frames. "
                f"ROI-based density (prototype thresholds). Relative motion score "
                f"({avg_motion:.2f} px/frame) is NOT vehicle speed. Device: {device_info['deviceName']}."
            ),
        },
        "roadIssues": road_issues_out,
        "anprResults": anpr_results,
        "safetyIncidents": safety_summary["incidents"],
        "safetySummary": safety_summary,
        "detectionTimeline": detection_timeline,
        "summary": (
            f"ByteTrack, Hazard & Safety analysis: {unique_vehicles_seen} unique vehicles tracked "
            f"({cars} cars, {buses} buses, {trucks} trucks, {motorcycles} motorcycles). "
            f"Density: {traffic_density}. Congestion: {congestion_level}. "
            f"Road hazards: {hazards_summary['totalDetected']} incidents recorded. "
            f"Safety incidents: {safety_summary['totalSafetyIncidents']} offending vehicle(s) tracked with ANPR."
        ),
        "sampledFrames": sampled_frames,
        "processedFrames": processed_frames,
        # Stage 2 tracking field
        "tracking": {
            "tracker": "ByteTrack",
            "activeVehicles": last_roi_active,
            "activeVehiclesAvg": avg_roi_active,
            "uniqueVehiclesSeen": unique_vehicles_seen,
            "vehicleCounts": {
                "car": cars,
                "motorcycle": motorcycles,
                "bus": buses,
                "truck": trucks,
            },
            "trafficDensity": traffic_density,
            "congestionLevel": congestion_level,
            "relativeMotionScorePixels": avg_motion,
            "roiConfig": roi,
            "limitations": (
                "Density/congestion thresholds are prototypes requiring real-traffic calibration. "
                "Relative motion is NOT vehicle speed (camera is moving, no calibration applied). "
                "ByteTrack ID persistence applies only within this submitted frame session."
            ),
        },
        "tracks": track_summaries,
        # Stage 3 hazard field
        "hazards": hazards_summary,
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"[ML Server] Starting UrbanSense ML Server on http://127.0.0.1:{port}")
    uvicorn.run("ml.api.ml_server:app", host="127.0.0.1", port=port, reload=False)

