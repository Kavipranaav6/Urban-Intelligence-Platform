"""
video_processor.py - Stage 2: ByteTrack + Traffic Analytics

Architecture:
  1. Run detector.track_video(video_path) which calls model.track() with
     persist=True on the FULL video. ByteTrack receives every consecutive
     frame so track IDs persist correctly.
  2. The full per-frame detection list is returned indexed by frame number.
  3. We then sample frames for output/reporting (same max_samples logic as
     Stage 1). No frames are skipped before the tracker sees them.
  4. For each sampled frame we annotate with "Class #track_id" labels.
  5. Analytics (ROI filtering, density, congestion, motion) run over all
     sampled frames after tracking is complete.

Preserves all existing API response fields expected by the React frontend.
Adds new fields: tracking, tracks (per-track summaries).
"""

import os
import cv2
import base64
import time
import numpy as np
from collections import deque
from typing import Dict, Any, List, Optional

from ml.inference.detector import YOLODetector
from ml.inference.hazard_detector import HazardDetector, HAZARD_COLOR_MAP
from ml.inference.anpr_detector import ANPRDetector
from ml.inference.incident_detector import IncidentDetector
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


class VideoProcessor:
    def __init__(
        self,
        detector: Optional[YOLODetector] = None,
        hazard_detector: Optional[HazardDetector] = None,
        anpr_detector: Optional[ANPRDetector] = None,
    ):
        self.detector = detector if detector is not None else YOLODetector()
        self.hazard_detector = hazard_detector if hazard_detector is not None else HazardDetector()
        self.anpr_detector = anpr_detector if anpr_detector is not None else ANPRDetector()

    def process_video_file(
        self,
        video_path: str,
        conf_threshold: float = 0.25,
        frame_interval: int = 15,
        max_samples: int = 10,
        bus_id: str = "BUS-103",
        gps_trace: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Stage 2 video processing with ByteTrack + traffic analytics.

        Flow:
          - detector.track_video() runs ByteTrack on every consecutive frame.
          - Output/reporting samples up to max_samples frames from results.
          - Analytics use sampled detections with real track IDs.
        """
        start_time = time.time()

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found at path: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        # ── Video metadata ────────────────────────────────────────────────
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
        duration = total_frames / fps if fps > 0 else 0.0

        mins = int(duration // 60)
        secs = int(duration % 60)
        duration_formatted = f"{mins:02d}:{secs:02d}"
        file_size_bytes = os.path.getsize(video_path)
        file_size_str = f"{file_size_bytes / (1024 * 1024):.1f} MB"
        file_name = os.path.basename(video_path)
        cap.release()

        # ── Load analytics config ─────────────────────────────────────────
        cfg = load_config()
        roi = cfg["roi"]
        density_thresholds = cfg["density"]
        congestion_thresholds = cfg["congestion"]

        # ── Run ByteTrack on the FULL video (consecutive frames) ──────────
        # track_video() calls model.track(source=video_path, persist=True, ...)
        # so ByteTrack sees every frame in order for reliable ID persistence.
        print(f"[VideoProcessor] Running ByteTrack on {file_name} ({total_frames} frames)...")
        per_frame_dets: List[List[Dict[str, Any]]] = self.detector.track_video(
            video_path, conf_threshold=conf_threshold
        )
        tracker_frame_count = len(per_frame_dets)
        print(f"[VideoProcessor] ByteTrack returned detections for {tracker_frame_count} frames.")

        # ── Determine which frames to include in output (sampling) ────────
        if tracker_frame_count <= max_samples:
            sampled_indices = list(range(tracker_frame_count))
        else:
            step = max(1, tracker_frame_count // max_samples)
            sampled_indices = list(range(0, tracker_frame_count, step))[:max_samples]

        # ── Analytics state ───────────────────────────────────────────────
        unique_vehicle_ids: set = set()
        class_max_counts = {"car": 0, "bus": 0, "truck": 0, "motorcycle": 0, "bicycle": 0, "person": 0}
        total_detections_across_frames = 0
        track_histories: Dict[int, deque] = {}
        track_class_map: Dict[int, str] = {}
        all_detections_by_frame: Dict[int, List[Dict[str, Any]]] = {}

        # ROI-filtered active counts per sampled frame (for density)
        roi_active_per_frame: List[int] = []

        # Accumulators for output
        processed_frames: List[Dict[str, Any]] = []
        sampled_frames_out: List[Dict[str, Any]] = []
        detection_timeline: List[Dict[str, Any]] = []

        # Stage 3: Hazard incident tracker (deduplicates road defects over time and space)
        hazard_tracker = self.hazard_detector.create_tracker(bus_id=bus_id)

        # Stage 4: Safety incident & offending vehicle tracker
        from ml.inference.incident_detector import IncidentDetector, interpolate_from_gps_trace
        incident_tracker = IncidentDetector(anpr_detector=self.anpr_detector, bus_id=bus_id, gps_trace=gps_trace)

        # Reopen video for frame-by-frame reads (annotation pass)
        cap2 = cv2.VideoCapture(video_path)

        for frame_idx in sampled_indices:
            detections = per_frame_dets[frame_idx] if frame_idx < len(per_frame_dets) else []

            # ── Per-frame analytics ───────────────────────────────────────
            all_detections_by_frame[frame_idx] = detections
            update_unique_ids(unique_vehicle_ids, detections)

            # Class max counts
            frame_class_counts: Dict[str, int] = {}
            for det in detections:
                cls = det["class"]
                frame_class_counts[cls] = frame_class_counts.get(cls, 0) + 1
                # Update class map for track summary
                tid = det.get("track_id", -1)
                if tid >= 0 and tid not in track_class_map:
                    track_class_map[tid] = cls
            for cls, cnt in frame_class_counts.items():
                if cls in class_max_counts:
                    class_max_counts[cls] = max(class_max_counts[cls], cnt)
            total_detections_across_frames += len(detections)

            # ROI-based active count + motion history
            active_in_roi, _ = compute_frame_active_counts(detections, width, height, roi)
            roi_active_per_frame.append(active_in_roi)

            for det in detections:
                tid = det.get("track_id", -1)
                if tid >= 0:
                    centre = bbox_centre(det["bboxPixels"])
                    update_motion_history(track_histories, tid, centre)

            # ── Read the actual frame pixels for annotation ───────────────
            cap2.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap2.read()

            frame_sec = round(frame_idx / fps, 2)
            f_mins = int(frame_sec // 60)
            f_secs = int(frame_sec % 60)
            timestamp_str = f"{f_mins:02d}:{f_secs:02d}"

            if not ret or frame is None:
                # Still add placeholder so timeline counts are consistent
                continue

            # ── Stage 3: Road & Infrastructure Hazard Detection ───────────
            # Vehicle tracking and hazard detection are separate concerns!
            # Hazards are NEVER fed into ByteTrack.
            hazard_dets = self.hazard_detector.detect_hazards_in_frame(frame)
            for hd in hazard_dets:
                hazard_tracker.add_or_update_detection(
                    hazard_class=hd["class"],
                    confidence=hd["confidence"],
                    severity=hd["severity"],
                    timestamp_sec=frame_sec,
                    frame_index=frame_idx,
                    bbox=hd["bboxPixels"],
                    frame=frame
                )

            # ── Stage 4: Offending Vehicle & Safety Incident Detection ───
            incident_tracker.update_frame(
                frame_idx=frame_idx,
                timestamp_sec=frame_sec,
                detections=detections,
                frame_width=width,
                frame_height=height,
                raw_frame=frame
            )

            # Raw frame JPEG
            _, raw_jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            raw_b64 = "data:image/jpeg;base64," + base64.b64encode(raw_jpg.tobytes()).decode("utf-8")

            # ── Annotate frame: Vehicles + Offender Alerts + Stage 3 Hazards
            annotated_frame = frame.copy()

            # 1. Annotate vehicles (Stage 2 ByteTrack & Stage 4 Offender Tracking)
            for det in detections:
                bbox = det["bboxPixels"]
                xmin, ymin, xmax, ymax = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                tid = det.get("track_id", -1)

                is_offender = tid in incident_tracker.offender_track_ids
                if is_offender:
                    # Offender visual alert: High-visibility Red box + warning tag
                    bgr_color = (30, 30, 235)  # Crimson Red
                    is_hit_run = any(inc["trackId"] == tid and inc["incidentType"] == "HIT_AND_RUN" for inc in incident_tracker.incidents)
                    offense_str = "HIT-AND-RUN" if is_hit_run else "RASH CUT-IN"
                    label_text = f"OFFENDER #{tid}: {offense_str}"

                    cv2.rectangle(annotated_frame, (xmin, ymin), (xmax, ymax), bgr_color, 3)
                    (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 2)
                    tag_y = max(ymin - 6, th + 4)
                    cv2.rectangle(annotated_frame, (xmin, tag_y - th - 5), (xmin + tw + 8, tag_y + 4), bgr_color, -1)
                    cv2.putText(annotated_frame, label_text, (xmin + 4, tag_y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2, cv2.LINE_AA)

                    # Draw ANPR plate badge under the vehicle bounding box
                    inc_match = next((inc for inc in incident_tracker.incidents if inc["trackId"] == tid), None)
                    if inc_match:
                        plate_badge = f"ANPR: {inc_match['plateNumber']} ({int(inc_match['plateConfidence'])}%)"
                        (ptw, pth), _ = cv2.getTextSize(plate_badge, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                        p_y = min(height - 4, ymax + pth + 6)
                        cv2.rectangle(annotated_frame, (xmin, ymax + 2), (xmin + ptw + 8, p_y + 4), (0, 215, 255), -1)
                        cv2.putText(annotated_frame, plate_badge, (xmin + 4, p_y),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
                    continue

                # Standard tracked vehicle label
                if tid >= 0:
                    label_text = f"{det['class'].capitalize()} #{tid}"
                else:
                    label_text = f"{det['class'].upper()} {det['confidence']}%"

                # Color
                color_hex = det.get("color", "#06b6d4").lstrip("#")
                b_c = int(color_hex[4:6], 16) if len(color_hex) == 6 else 212
                g_c = int(color_hex[2:4], 16) if len(color_hex) == 6 else 182
                r_c = int(color_hex[0:2], 16) if len(color_hex) == 6 else 6
                bgr_color = (b_c, g_c, r_c)

                cv2.rectangle(annotated_frame, (xmin, ymin), (xmax, ymax), bgr_color, 2)
                (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                tag_y = max(ymin - 6, th + 4)
                cv2.rectangle(annotated_frame, (xmin, tag_y - th - 4), (xmin + tw + 8, tag_y + 4), bgr_color, -1)
                cv2.putText(annotated_frame, label_text, (xmin + 4, tag_y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

            # 2. Annotate hazards (Stage 3 Hazard Detection)
            for hd in hazard_dets:
                h_bbox = hd["bboxPixels"]
                h_xmin, h_ymin, h_xmax, h_ymax = int(h_bbox[0]), int(h_bbox[1]), int(h_bbox[2]), int(h_bbox[3])
                h_color = HAZARD_COLOR_MAP.get(hd["class"], (0, 140, 255))
                h_label = f"{hd['class'].replace('_', ' ').upper()} [{hd['severity']}]"

                cv2.rectangle(annotated_frame, (h_xmin, h_ymin), (h_xmax, h_ymax), h_color, 2)
                (htw, hth), _ = cv2.getTextSize(h_label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                htag_y = max(h_ymin - 6, hth + 4)
                cv2.rectangle(annotated_frame, (h_xmin, htag_y - hth - 4), (h_xmin + htw + 8, htag_y + 4), h_color, -1)
                cv2.putText(annotated_frame, h_label, (h_xmin + 4, htag_y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

            _, ann_jpg = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            ann_b64 = "data:image/jpeg;base64," + base64.b64encode(ann_jpg.tobytes()).decode("utf-8")

            sampled_frames_out.append({
                "timestamp": timestamp_str,
                "timestampSec": frame_sec,
                "frameIndex": frame_idx,
                "frameDataUrl": raw_b64,
                "annotatedFrameDataUrl": ann_b64,
            })

            combined_frame_detections = list(detections) + [
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
                "timestamp": timestamp_str,
                "timestampSec": frame_sec,
                "frameIndex": frame_idx,
                "frameDataUrl": raw_b64,
                "annotatedFrameDataUrl": ann_b64,
                "detections": combined_frame_detections,
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
                    "timestamp": timestamp_str,
                    "timestampSec": frame_sec,
                    "category": "VEHICLE" if top_det["class"] != "person" else "PEDESTRIAN",
                    "title": title,
                    "details": f"Tracked {len(detections)} object(s) in frame @ {timestamp_str}. Top: {top_det['label']} (Conf: {top_det['confidence']}%)",
                    "confidence": top_det["confidence"],
                    "evidenceFrame": ann_b64,
                })

        cap2.release()

        # ── Final analytics calculations ──────────────────────────────────
        cars = class_max_counts["car"]
        buses = class_max_counts["bus"]
        trucks = class_max_counts["truck"]
        motorcycles = class_max_counts["motorcycle"]
        bicycles = class_max_counts["bicycle"]
        pedestrians = class_max_counts["person"]
        total_vehicles = cars + buses + trucks + motorcycles + bicycles

        # Active vehicles: use the last sampled frame's ROI count as representative
        last_roi_active = roi_active_per_frame[-1] if roi_active_per_frame else 0
        avg_roi_active = round(sum(roi_active_per_frame) / max(1, len(roi_active_per_frame)), 1)

        # Unique vehicles seen: count of distinct valid track IDs
        unique_vehicles_seen = len(unique_vehicle_ids)

        # Motion score (pixel displacement, NOT speed)
        avg_motion = average_motion_score(track_histories)

        # Density & congestion
        traffic_density = classify_density(last_roi_active, density_thresholds)
        congestion_level = classify_congestion(last_roi_active, traffic_density, avg_motion, congestion_thresholds)

        # Per-track summaries
        track_summaries = build_track_summaries(all_detections_by_frame, track_histories, track_class_map)

        avg_per_frame = round(total_detections_across_frames / max(1, len(sampled_indices)), 1)
        proc_time_ms = int((time.time() - start_time) * 1000)
        report_id = f"REP-BYT-{int(time.time())}"
        device_info = self.detector.get_device_info()

        # ── Stage 3: Hazards Summary & Road Issues ───────────────────────
        hazards_summary = hazard_tracker.get_summary()
        hazards_summary["hazardModelAvailable"] = self.hazard_detector.is_available
        hazards_summary["modelPath"] = self.hazard_detector.model_path

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

        # ── Stage 4: Safety Incidents & ANPR Extraction ─────────────────
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

        # Add plate extractions for other tracked vehicles
        for tid in sorted(unique_vehicle_ids):
            if not any(a.get("trackId") == tid for a in anpr_results):
                v_cls = track_class_map.get(tid, "car")
                anpr_item = self.anpr_detector.extract_registration(
                    frame=None,
                    vehicle_bbox=[0, 0, 0, 0],
                    track_id=tid,
                    timestamp_sec=0.0,
                    vehicle_class=v_cls
                )
                anpr_results.append(anpr_item)

        if gps_trace:
            for a_res in anpr_results:
                if a_res.get("latitude") is None or not a_res.get("offendingVehicle"):
                    a_ts = float(a_res.get("timestampSec", 1.0))
                    a_gps = interpolate_from_gps_trace(a_ts, gps_trace)
                    a_res["latitude"] = a_gps["latitude"]
                    a_res["longitude"] = a_gps["longitude"]
                    a_res["locationName"] = a_gps["locationName"]

        # Append offending vehicle safety events to detection timeline
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

        print(f"[VideoProcessor] Done. Active={last_roi_active} Unique={unique_vehicles_seen} "
              f"Density={traffic_density} Congestion={congestion_level} Hazards={hazards_summary['totalDetected']} "
              f"SafetyIncidents={safety_summary['totalSafetyIncidents']} Plates={len(anpr_results)}")

        # ── Return report ─────────────────────────────────────────────────
        # All existing Stage 1 & Stage 2 fields are preserved. Stage 3 & 4 fields added.
        return {
            # ── Existing Stage 1 fields ──────────────────────────────────
            "id": report_id,
            "mode": "UPLOADED VIDEO ANALYSIS",
            "inferenceEngine": f"REAL YOLOv8 + ByteTrack ({device_info['deviceName']})",
            "isRealModelInference": True,
            "device": device_info["device"],
            "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "processingTimeMs": proc_time_ms,
            "video": {
                "fileName": file_name,
                "fileSize": file_size_str,
                "duration": round(duration, 2),
                "durationFormatted": duration_formatted,
                "fps": round(fps, 1),
                "totalFrames": total_frames,
                "framesAnalyzed": len(sampled_indices),
                "resolution": f"{width}x{height}",
            },
            # vehicleCounts: uniqueVehicles comes from ByteTrack unique IDs
            "vehicleCounts": {
                "uniqueVehicles": unique_vehicles_seen,
                "cars": cars,
                "buses": buses,
                "trucks": trucks,
                "motorcycles": motorcycles,
                "bicycles": bicycles,
                "pedestrians": pedestrians,
            },
            # trafficAnalysis: extends existing fields, preserves all keys
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
                    f"ByteTrack tracking. ROI-based density (prototype thresholds; requires "
                    f"calibration). Relative motion score ({avg_motion:.2f} px/frame) is NOT "
                    f"vehicle speed - camera is moving. Device: {device_info['deviceName']}."
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
            "sampledFrames": sampled_frames_out,
            "processedFrames": processed_frames,
            # ── Stage 2 tracking fields ──────────────────────────────────
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
                "densityThresholds": density_thresholds,
                "congestionThresholds": congestion_thresholds,
                "limitations": (
                    "Density/congestion thresholds are prototypes requiring real-traffic calibration. "
                    "Relative motion is NOT vehicle speed (camera is moving, no calibration applied)."
                ),
            },
            "tracks": track_summaries,
            # ── Stage 3 hazard fields ────────────────────────────────────
            "hazards": hazards_summary,
        }
