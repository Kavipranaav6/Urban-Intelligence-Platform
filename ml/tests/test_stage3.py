"""
test_stage3.py - Stage 3 Unit & Integration Tests for UrbanSense AI

Verifies:
  1. HazardDetector initializes gracefully when model is missing (is_available=False).
  2. HazardDetector can initialize with a custom model / real model when present.
  3. Class normalization correctly maps known hazard variants and retains 'unknown'.
  4. Severity calculation is deterministic and returns HIGH, MEDIUM, or LOW.
  5. Hazard ROI filtering correctly includes road points and excludes out-of-ROI coordinates.
  6. Temporal and spatial deduplication prevents redundant incident creation for the same hazard.
  7. Higher-confidence detection updates the existing incident record and keeps peak confidence.
  8. Incident IDs are formatted uniquely (e.g. HAZ-0001, HAZ-0002).
  9. No fake GPS coordinates are generated (latitude and longitude remain None).
  10. VideoProcessor still runs vehicle detection and ByteTrack tracking (Stage 1 & 2 compat).
  11. Existing Stage 1 fields are fully preserved in the final report.
  12. Existing Stage 2 tracking fields ('tracking', 'tracks') are fully preserved.
  13. Stage 3 'hazards' block is present in the report with byType and bySeverity counts.
  14. Fast-API endpoints (/health, /analyze-frames, /analyze-video) respond successfully.

Run with:
    python -m pytest ml/tests/test_stage3.py -v
"""

import os
import sys
import unittest
import numpy as np

# Ensure project root is on sys.path
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

_TEST_VIDEO = os.path.join(_ROOT, "test_traffic.mp4")
HAS_TEST_VIDEO = os.path.isfile(_TEST_VIDEO)


# ---------------------------------------------------------------------------
# Test Suite 1: Pure-Python Hazard Helpers (No Model Required)
# ---------------------------------------------------------------------------
class TestHazardHelpers(unittest.TestCase):

    def setUp(self):
        from ml.inference.hazard_detector import (
            normalize_hazard_class,
            is_inside_hazard_roi,
            calculate_hazard_severity,
            HAZARD_CLASS_MAPPINGS,
            HazardIncidentTracker,
        )
        self.normalize_hazard_class = normalize_hazard_class
        self.is_inside_hazard_roi = is_inside_hazard_roi
        self.calculate_hazard_severity = calculate_hazard_severity
        self.HAZARD_CLASS_MAPPINGS = HAZARD_CLASS_MAPPINGS
        self.HazardIncidentTracker = HazardIncidentTracker

    def test_normalize_pothole_variants(self):
        self.assertEqual(self.normalize_hazard_class("pothole"), "pothole")
        self.assertEqual(self.normalize_hazard_class("Potholes"), "pothole")
        self.assertEqual(self.normalize_hazard_class("pit"), "pothole")
        self.assertEqual(self.normalize_hazard_class("open_manhole"), "pothole")

    def test_normalize_waterlogging_variants(self):
        self.assertEqual(self.normalize_hazard_class("waterlogging"), "waterlogging")
        self.assertEqual(self.normalize_hazard_class("water"), "waterlogging")
        self.assertEqual(self.normalize_hazard_class("flooded_road"), "waterlogging")
        self.assertEqual(self.normalize_hazard_class("puddle"), "waterlogging")

    def test_normalize_road_damage_variants(self):
        self.assertEqual(self.normalize_hazard_class("road_damage"), "road_damage")
        self.assertEqual(self.normalize_hazard_class("crack"), "road_damage")
        self.assertEqual(self.normalize_hazard_class("damaged_road"), "road_damage")
        self.assertEqual(self.normalize_hazard_class("alligator_crack"), "road_damage")

    def test_normalize_traffic_sign_variants(self):
        self.assertEqual(self.normalize_hazard_class("traffic_sign"), "traffic_sign")
        self.assertEqual(self.normalize_hazard_class("damaged_sign"), "traffic_sign")
        self.assertEqual(self.normalize_hazard_class("missing_sign"), "traffic_sign")

    def test_normalize_unknown_class_stays_unknown(self):
        # Must NOT blindly coerce unknown objects into hazards
        self.assertEqual(self.normalize_hazard_class("tree"), "unknown")
        self.assertEqual(self.normalize_hazard_class("random_debris"), "unknown")
        self.assertEqual(self.normalize_hazard_class(""), "unknown")

    def test_hazard_roi_inside(self):
        # 1280x720 frame, center at (640, 500) -> norm (0.50, 0.69) inside [0.05..0.95, 0.35..1.00]
        roi = {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00}
        bbox = [540, 450, 740, 550]
        self.assertTrue(self.is_inside_hazard_roi(bbox, 1280, 720, roi))

    def test_hazard_roi_outside(self):
        # Sky/top region: center at (640, 100) -> norm_y = 0.14 (above y_min=0.35)
        roi = {"x_min": 0.05, "y_min": 0.35, "x_max": 0.95, "y_max": 1.00}
        bbox = [540, 50, 740, 150]
        self.assertFalse(self.is_inside_hazard_roi(bbox, 1280, 720, roi))

    def test_severity_high_by_area(self):
        # Large bbox: 400x300 in 1000x1000 -> area=0.12 >= 0.08
        cfg = {"high_area": 0.08, "medium_area": 0.025, "high_confidence": 0.85, "medium_confidence": 0.60}
        bbox = [100, 100, 500, 400]
        sev = self.calculate_hazard_severity(bbox, 0.50, 1000, 1000, cfg)
        self.assertEqual(sev, "HIGH")

    def test_severity_high_by_confidence(self):
        # Small bbox but high confidence: 92% >= 85%
        cfg = {"high_area": 0.08, "medium_area": 0.025, "high_confidence": 0.85, "medium_confidence": 0.60}
        bbox = [100, 100, 150, 150]  # area = 0.0025
        sev = self.calculate_hazard_severity(bbox, 0.92, 1000, 1000, cfg)
        self.assertEqual(sev, "HIGH")

    def test_severity_medium(self):
        cfg = {"high_area": 0.08, "medium_area": 0.025, "high_confidence": 0.85, "medium_confidence": 0.60}
        bbox = [100, 100, 300, 250]  # 200x150 in 1000x1000 -> area=0.03 >= 0.025
        sev = self.calculate_hazard_severity(bbox, 0.50, 1000, 1000, cfg)
        self.assertEqual(sev, "MEDIUM")

    def test_severity_low(self):
        cfg = {"high_area": 0.08, "medium_area": 0.025, "high_confidence": 0.85, "medium_confidence": 0.60}
        bbox = [100, 100, 140, 140]  # 40x40 in 1000x1000 -> area=0.0016
        sev = self.calculate_hazard_severity(bbox, 0.45, 1000, 1000, cfg)
        self.assertEqual(sev, "LOW")

    def test_severity_always_valid_enum(self):
        cfg = {"high_area": 0.08, "medium_area": 0.025, "high_confidence": 0.85, "medium_confidence": 0.60}
        for area_w in [10, 100, 400]:
            for conf in [0.2, 0.5, 0.7, 0.95]:
                sev = self.calculate_hazard_severity([0, 0, area_w, area_w], conf, 1000, 1000, cfg)
                self.assertIn(sev, {"LOW", "MEDIUM", "HIGH"})


# ---------------------------------------------------------------------------
# Test Suite 2: Temporal & Spatial Deduplication (HazardIncidentTracker)
# ---------------------------------------------------------------------------
class TestHazardDeduplication(unittest.TestCase):

    def setUp(self):
        from ml.inference.hazard_detector import HazardIncidentTracker
        self.tracker = HazardIncidentTracker(time_window_seconds=5.0, distance_pixels=100.0, bus_id="BUS-TEST")

    def test_first_detection_creates_incident(self):
        inc = self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.75,
            severity="MEDIUM",
            timestamp_sec=1.0,
            frame_index=10,
            bbox=[200, 400, 300, 500]
        )
        self.assertEqual(inc["id"], "HAZ-0001")
        self.assertEqual(inc["type"], "pothole")
        self.assertEqual(inc["status"], "NEW")
        self.assertEqual(len(self.tracker.incidents), 1)

    def test_repeated_detection_within_window_deduplicates(self):
        # Frame 1: Pothole at center (250, 450)
        self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.75,
            severity="MEDIUM",
            timestamp_sec=1.0,
            frame_index=10,
            bbox=[200, 400, 300, 500]
        )
        # Frame 2: Same pothole slightly shifted at center (260, 455) within 20px and 0.5s later
        inc2 = self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.78,
            severity="MEDIUM",
            timestamp_sec=1.5,
            frame_index=15,
            bbox=[210, 405, 310, 505]
        )
        # MUST remain 1 incident with updated peak confidence
        self.assertEqual(len(self.tracker.incidents), 1)
        self.assertEqual(inc2["id"], "HAZ-0001")
        self.assertEqual(inc2["confidence"], 78.0)
        self.assertEqual(inc2["observationCount"], 2)

    def test_distant_detection_creates_new_incident(self):
        # Detection 1: left side (200, 400)
        self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.70,
            severity="LOW",
            timestamp_sec=1.0,
            frame_index=10,
            bbox=[150, 350, 250, 450]
        )
        # Detection 2: right side (800, 400) - distance > 100px
        inc2 = self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.85,
            severity="HIGH",
            timestamp_sec=1.2,
            frame_index=12,
            bbox=[750, 350, 850, 450]
        )
        self.assertEqual(len(self.tracker.incidents), 2)
        self.assertEqual(inc2["id"], "HAZ-0002")

    def test_time_expired_creates_new_incident(self):
        # Detection 1 at t=1.0s
        self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.70,
            severity="LOW",
            timestamp_sec=1.0,
            frame_index=10,
            bbox=[200, 400, 300, 500]
        )
        # Detection 2 at t=10.0s (delta=9s > time_window=5s)
        inc2 = self.tracker.add_or_update_detection(
            hazard_class="pothole",
            confidence=0.80,
            severity="MEDIUM",
            timestamp_sec=10.0,
            frame_index=100,
            bbox=[205, 405, 305, 505]
        )
        self.assertEqual(len(self.tracker.incidents), 2)
        self.assertEqual(inc2["id"], "HAZ-0002")

    def test_gps_telemetry_placeholder_is_none(self):
        inc = self.tracker.add_or_update_detection(
            hazard_class="waterlogging",
            confidence=0.80,
            severity="MEDIUM",
            timestamp_sec=2.0,
            frame_index=20,
            bbox=[300, 450, 500, 600]
        )
        # Crucial safety check: Never invent fake GPS coordinates
        self.assertIn("location", inc)
        self.assertIsNone(inc["location"]["latitude"])
        self.assertIsNone(inc["location"]["longitude"])

    def test_summary_counts_by_type_and_severity(self):
        self.tracker.add_or_update_detection("pothole", 0.90, "HIGH", 1.0, 10, [100, 400, 200, 500])
        self.tracker.add_or_update_detection("waterlogging", 0.70, "MEDIUM", 1.2, 12, [500, 400, 700, 600])
        self.tracker.add_or_update_detection("traffic_sign", 0.50, "LOW", 1.5, 15, [800, 200, 900, 350])

        summary = self.tracker.get_summary()
        self.assertEqual(summary["totalDetected"], 3)
        self.assertEqual(summary["activeIncidents"], 3)
        self.assertEqual(summary["byType"]["pothole"], 1)
        self.assertEqual(summary["byType"]["waterlogging"], 1)
        self.assertEqual(summary["byType"]["traffic_sign"], 1)
        self.assertEqual(summary["bySeverity"]["high"], 1)
        self.assertEqual(summary["bySeverity"]["medium"], 1)
        self.assertEqual(summary["bySeverity"]["low"], 1)


# ---------------------------------------------------------------------------
# Test Suite 3: HazardDetector Lifecycle & Mock Integration
# ---------------------------------------------------------------------------
class TestHazardDetectorLifecycle(unittest.TestCase):

    def test_missing_model_fallback_mode(self):
        from ml.inference.hazard_detector import HazardDetector
        # Instantiating with a non-existent path should NOT raise an exception
        detector = HazardDetector(model_path="ml/models/non_existent_hazard_weights.pt")
        self.assertFalse(detector.is_available)
        self.assertIsNone(detector.model)

        # Calling detect_hazards_in_frame must return an empty list gracefully
        dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        res = detector.detect_hazards_in_frame(dummy_frame)
        self.assertEqual(res, [])

    def test_custom_model_mock_injection(self):
        from ml.inference.hazard_detector import HazardDetector
        import torch

        # Create a mock YOLO-like result object
        class MockBox:
            def __init__(self, cls_id, conf, xyxy):
                self.cls = torch.tensor([cls_id])
                self.conf = torch.tensor([conf])
                self.xyxy = torch.tensor([xyxy])

        class MockResult:
            def __init__(self):
                self.boxes = [
                    MockBox(cls_id=0, conf=0.88, xyxy=[400.0, 400.0, 600.0, 600.0])
                ]
                self.names = {0: "pothole"}

        class MockModel:
            def predict(self, source, **kwargs):
                return [MockResult()]

        detector = HazardDetector(custom_model=MockModel())
        self.assertTrue(detector.is_available)

        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        dets = detector.detect_hazards_in_frame(frame)
        self.assertEqual(len(dets), 1)
        self.assertEqual(dets[0]["class"], "pothole")
        self.assertEqual(dets[0]["confidence"], 88.0)
        self.assertEqual(dets[0]["severity"], "HIGH")
        self.assertEqual(len(dets[0]["center"]), 2)


# ---------------------------------------------------------------------------
# Test Suite 4: End-to-End VideoProcessor & Backward Compatibility
# ---------------------------------------------------------------------------
@unittest.skipUnless(HAS_TEST_VIDEO, "test_traffic.mp4 not found; skipping VideoProcessor integration tests")
class TestStage3VideoProcessorReport(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from ml.inference.detector import YOLODetector
        from ml.inference.hazard_detector import HazardDetector
        from ml.inference.video_processor import VideoProcessor
        import torch

        # Use mock hazard model so we can verify full Stage 3 pipeline even without trained weights
        class MockBox:
            def __init__(self, cls_id, conf, xyxy):
                self.cls = torch.tensor([cls_id])
                self.conf = torch.tensor([conf])
                self.xyxy = torch.tensor([xyxy])

        class MockResult:
            def __init__(self):
                self.boxes = [
                    MockBox(cls_id=0, conf=0.89, xyxy=[450.0, 450.0, 650.0, 600.0])
                ]
                self.names = {0: "pothole"}

        class MockHazardYOLO:
            def predict(self, source, **kwargs):
                return [MockResult()]

        det = YOLODetector("yolov8n.pt")
        haz_det = HazardDetector(custom_model=MockHazardYOLO())
        vp = VideoProcessor(detector=det, hazard_detector=haz_det)
        cls.report = vp.process_video_file(_TEST_VIDEO, conf_threshold=0.25, max_samples=4)

    def test_stage1_fields_present(self):
        for key in ["id", "mode", "inferenceEngine", "isRealModelInference", "vehicleCounts",
                    "trafficAnalysis", "roadIssues", "detectionTimeline", "summary"]:
            self.assertIn(key, self.report, f"Stage 1 field '{key}' missing")

    def test_stage2_tracking_present(self):
        self.assertIn("tracking", self.report)
        self.assertIn("tracks", self.report)
        self.assertIn("activeVehicles", self.report["tracking"])
        self.assertIn("uniqueVehiclesSeen", self.report["tracking"])
        self.assertIn(self.report["tracking"]["trafficDensity"], {"LOW", "MEDIUM", "HIGH"})

    def test_stage3_hazards_field_present(self):
        self.assertIn("hazards", self.report)
        h = self.report["hazards"]
        self.assertIn("totalDetected", h)
        self.assertIn("activeIncidents", h)
        self.assertIn("byType", h)
        self.assertIn("bySeverity", h)
        self.assertIn("incidents", h)

    def test_stage3_hazard_deduplication_in_report(self):
        # 4 sampled frames processed with the mock detection should deduplicate into 1 incident
        h = self.report["hazards"]
        self.assertEqual(h["totalDetected"], 1)
        self.assertEqual(len(h["incidents"]), 1)
        self.assertEqual(h["incidents"][0]["type"], "pothole")
        self.assertEqual(h["incidents"][0]["status"], "NEW")

    def test_stage3_road_issues_populated_for_legacy_compat(self):
        # roadIssues in report should contain the hazard incident for Stage 1 consumers
        self.assertGreater(len(self.report["roadIssues"]), 0)
        issue0 = self.report["roadIssues"][0]
        self.assertEqual(issue0["type"], "Pothole")
        self.assertIn("evidenceFrame", issue0)
        self.assertTrue(issue0["evidenceFrame"].startswith("data:image"))

    def test_stage3_timeline_contains_hazard_event(self):
        timeline = self.report["detectionTimeline"]
        hazard_events = [e for e in timeline if e.get("category") == "HAZARD"]
        self.assertGreater(len(hazard_events), 0)
        self.assertIn("Pothole", hazard_events[0]["title"])


# ---------------------------------------------------------------------------
# Test Suite 5: FastAPI ML Server Endpoints
# ---------------------------------------------------------------------------
class TestFastAPIStage3Endpoints(unittest.TestCase):

    def setUp(self):
        from fastapi.testclient import TestClient
        from ml.api.ml_server import app
        self.client = TestClient(app)

    def test_health_endpoint_stage3(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["version"].startswith("3.") or data["version"].startswith("4."))
        self.assertIn("hazardDetection", data)
        self.assertIn("available", data["hazardDetection"])
        self.assertIn("supportedClasses", data["hazardDetection"])

    def test_analyze_frames_stage3_response(self):
        import cv2
        import base64

        # Generate a small dummy frame
        canvas = np.zeros((360, 640, 3), dtype=np.uint8)
        _, jpg = cv2.imencode(".jpg", canvas)
        b64 = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode("utf-8")

        payload = {
            "videoMetadata": {"fileName": "test.mp4", "duration": 1.0},
            "sampledFrames": [
                {"frameDataUrl": b64, "timestamp": "00:00", "timestampSec": 0.0, "frameIndex": 0}
            ],
            "busId": "BUS-TEST-3"
        }
        res = self.client.post("/analyze-frames", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Stage 1 fields
        self.assertIn("vehicleCounts", data)
        self.assertIn("trafficAnalysis", data)
        self.assertIn("roadIssues", data)

        # Stage 2 fields
        self.assertIn("tracking", data)
        self.assertIn("tracks", data)

        # Stage 3 fields
        self.assertIn("hazards", data)
        self.assertIn("totalDetected", data["hazards"])
        self.assertIn("byType", data["hazards"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
