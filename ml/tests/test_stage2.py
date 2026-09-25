"""
test_stage2.py - Stage 2 Integration Tests for UrbanSense AI

Tests verify:
  1.  Video file exists and opens.
  2.  YOLOv8 detection still works on a single frame (Stage 1 backward compat).
  3.  ByteTrack track_video() returns per-frame detections.
  4.  At least one track_id >= 0 appears when the video contains vehicles.
  5.  uniqueVehiclesSeen >= activeVehicles.
  6.  ROI filtering (is_inside_roi) works correctly.
  7.  Density classification returns one of: LOW, MEDIUM, HIGH.
  8.  Congestion classification returns one of: LOW, MEDIUM, HIGH.
  9.  Track trajectories do not exceed 30 points (deque maxlen).
  10. relativeMotionScore is a non-negative numeric value.
  11. Existing Stage 1 fields are present in the VideoProcessor report.
  12. 'tracking' key is present in the report.
  13. Annotated frames have annotatedFrameDataUrl.

Run from the project root:
    python -m pytest ml/tests/test_stage2.py -v
or:
    python -m ml.tests.test_stage2
"""

import os
import sys
import unittest

# Ensure project root is on sys.path
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

_PROJECT_ROOT = _ROOT
_TEST_VIDEO = os.path.join(_PROJECT_ROOT, "test_traffic.mp4")
HAS_TEST_VIDEO = os.path.isfile(_TEST_VIDEO)

print(f"[test_stage2] Project root  : {_PROJECT_ROOT}")
print(f"[test_stage2] Test video     : {_TEST_VIDEO}")
print(f"[test_stage2] Video present  : {HAS_TEST_VIDEO}")


# ---------------------------------------------------------------------------
# Analytics unit tests (no GPU / YOLO required)
# ---------------------------------------------------------------------------
class TestAnalyticsHelpers(unittest.TestCase):
    """Pure-Python analytics helpers -- no model needed."""

    def setUp(self):
        from ml.inference.analytics import (
            load_config,
            is_inside_roi,
            bbox_centre,
            compute_frame_active_counts,
            update_unique_ids,
            classify_density,
            classify_congestion,
            update_motion_history,
            average_motion_score,
            build_track_summaries,
        )
        self.cfg = load_config()
        self.is_inside_roi = is_inside_roi
        self.bbox_centre = bbox_centre
        self.compute_frame_active_counts = compute_frame_active_counts
        self.update_unique_ids = update_unique_ids
        self.classify_density = classify_density
        self.classify_congestion = classify_congestion
        self.update_motion_history = update_motion_history
        self.average_motion_score = average_motion_score
        self.build_track_summaries = build_track_summaries

    def test_roi_inside(self):
        roi = {"x_min": 0.10, "y_min": 0.35, "x_max": 0.90, "y_max": 0.95}
        bbox = [400, 480, 600, 720]  # centre (500, 600) in 1000x1000 frame
        self.assertTrue(self.is_inside_roi(bbox, 1000, 1000, roi))

    def test_roi_outside(self):
        roi = {"x_min": 0.10, "y_min": 0.35, "x_max": 0.90, "y_max": 0.95}
        bbox = [0, 0, 100, 100]  # centre (50, 50) -- above/left of ROI
        self.assertFalse(self.is_inside_roi(bbox, 1000, 1000, roi))

    def test_bbox_centre(self):
        cx, cy = self.bbox_centre([100, 200, 300, 400])
        self.assertAlmostEqual(cx, 200.0)
        self.assertAlmostEqual(cy, 300.0)

    def test_density_low(self):
        self.assertEqual(self.classify_density(3, self.cfg["density"]), "LOW")

    def test_density_medium(self):
        self.assertEqual(self.classify_density(8, self.cfg["density"]), "MEDIUM")

    def test_density_high(self):
        self.assertEqual(self.classify_density(15, self.cfg["density"]), "HIGH")

    def test_density_values_always_valid(self):
        for n in range(20):
            d = self.classify_density(n, self.cfg["density"])
            self.assertIn(d, {"LOW", "MEDIUM", "HIGH"})

    def test_congestion_values_always_valid(self):
        for n in range(20):
            density = self.classify_density(n, self.cfg["density"])
            c = self.classify_congestion(n, density, 5.0, self.cfg["congestion"])
            self.assertIn(c, {"LOW", "MEDIUM", "HIGH"})

    def test_unique_ids_accumulate(self):
        unique = set()
        dets1 = [{"track_id": 1, "class": "car",  "bboxPixels": [0, 0, 100, 100]},
                 {"track_id": 2, "class": "bus",  "bboxPixels": [100, 0, 200, 100]}]
        dets2 = [{"track_id": 2, "class": "bus",  "bboxPixels": [100, 0, 200, 100]},
                 {"track_id": 3, "class": "car",  "bboxPixels": [200, 0, 300, 100]}]
        self.update_unique_ids(unique, dets1)
        self.update_unique_ids(unique, dets2)
        self.assertEqual(len(unique), 3)

    def test_unique_ids_ignores_negative(self):
        unique = set()
        self.update_unique_ids(unique, [{"track_id": -1, "class": "car", "bboxPixels": [0, 0, 100, 100]}])
        self.assertEqual(len(unique), 0)

    def test_motion_history_deque_maxlen(self):
        histories = {}
        for i in range(50):
            self.update_motion_history(histories, 1, (float(i), float(i)), maxlen=30)
        self.assertLessEqual(len(histories[1]), 30)

    def test_motion_score_numeric_and_correct(self):
        histories = {}
        self.update_motion_history(histories, 1, (0.0, 0.0))
        self.update_motion_history(histories, 1, (3.0, 4.0))
        score = self.average_motion_score(histories)
        self.assertIsInstance(score, float)
        self.assertGreaterEqual(score, 0.0)
        self.assertAlmostEqual(score, 5.0, places=1)  # 3-4-5 triangle

    def test_active_counts_in_roi(self):
        roi = {"x_min": 0.10, "y_min": 0.35, "x_max": 0.90, "y_max": 0.95}
        dets = [
            {"class": "car", "bboxPixels": [400, 480, 600, 720]},  # inside
            {"class": "bus", "bboxPixels": [0, 0, 100, 100]},      # outside
        ]
        total, by_cls = self.compute_frame_active_counts(dets, 1000, 1000, roi)
        self.assertEqual(total, 1)
        self.assertEqual(by_cls.get("car", 0), 1)

    def test_track_summaries_structure(self):
        histories = {}
        self.update_motion_history(histories, 5, (100.0, 200.0))
        self.update_motion_history(histories, 5, (110.0, 205.0))
        all_dets = {
            0: [{"track_id": 5, "class": "car", "bboxPixels": [50, 150, 150, 250]}],
            1: [{"track_id": 5, "class": "car", "bboxPixels": [60, 155, 160, 255]}],
        }
        summaries = self.build_track_summaries(all_dets, histories, {5: "car"})
        self.assertEqual(len(summaries), 1)
        s = summaries[0]
        self.assertEqual(s["track_id"], 5)
        self.assertIn("trajectory", s)
        self.assertIn("relativeMotionScore", s)
        self.assertIsInstance(s["relativeMotionScore"], float)

    def test_config_has_required_keys(self):
        for key in ("roi", "density", "congestion"):
            self.assertIn(key, self.cfg)


# ---------------------------------------------------------------------------
# Detector / ByteTrack tests (require real video)
# ---------------------------------------------------------------------------
@unittest.skipUnless(HAS_TEST_VIDEO, "test_traffic.mp4 not found; skipping model-dependent tests")
class TestByteTrackWithRealVideo(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        print("\n[test_stage2] Loading YOLODetector for ByteTrack tests...")
        from ml.inference.detector import YOLODetector
        cls.detector = YOLODetector("yolov8n.pt")

    def test_video_opens(self):
        import cv2
        cap = cv2.VideoCapture(_TEST_VIDEO)
        self.assertTrue(cap.isOpened())
        ret, _ = cap.read()
        self.assertTrue(ret)
        cap.release()

    def test_detect_frame_stage1_compat(self):
        import cv2
        cap = cv2.VideoCapture(_TEST_VIDEO)
        ret, frame = cap.read()
        cap.release()
        self.assertTrue(ret)
        dets = self.detector.detect_frame(frame, conf_threshold=0.25)
        self.assertIsInstance(dets, list)
        if dets:
            for field in ("id", "class", "confidence", "x", "y", "width", "height", "bboxPixels", "color"):
                self.assertIn(field, dets[0], f"Stage 1 field '{field}' missing")

    def test_track_video_returns_per_frame_list(self):
        per_frame = self.detector.track_video(_TEST_VIDEO, conf_threshold=0.25)
        self.assertIsInstance(per_frame, list)
        self.assertGreater(len(per_frame), 0)
        self.assertIsInstance(per_frame[0], list)

    def test_track_ids_present(self):
        per_frame = self.detector.track_video(_TEST_VIDEO, conf_threshold=0.25)
        all_dets = [d for frame in per_frame for d in frame]
        if not all_dets:
            self.skipTest("No detections in test video.")
        valid_ids = [d["track_id"] for d in all_dets if d.get("track_id", -1) >= 0]
        self.assertGreater(len(valid_ids), 0, "ByteTrack must assign at least one valid track_id")

    def test_track_id_persistence_across_frames(self):
        per_frame = self.detector.track_video(_TEST_VIDEO, conf_threshold=0.25)
        id_frames: dict = {}
        for fi, dets in enumerate(per_frame):
            for d in dets:
                tid = d.get("track_id", -1)
                if tid >= 0:
                    id_frames.setdefault(tid, []).append(fi)
        if not id_frames:
            self.skipTest("No tracked vehicles.")
        persistent = {tid: frames for tid, frames in id_frames.items() if len(frames) >= 2}
        self.assertGreater(len(persistent), 0, "At least one track_id must persist across >= 2 frames")

    def test_unique_vehicles_gte_active(self):
        from ml.inference.analytics import load_config, compute_frame_active_counts, update_unique_ids
        cfg = load_config()
        per_frame = self.detector.track_video(_TEST_VIDEO, conf_threshold=0.25)
        unique = set()
        for dets in per_frame:
            update_unique_ids(unique, dets)
        import cv2
        cap = cv2.VideoCapture(_TEST_VIDEO)
        ret, frame = cap.read()
        cap.release()
        w = frame.shape[1] if ret else 1280
        h = frame.shape[0] if ret else 720
        max_active = max(
            (compute_frame_active_counts(dets, w, h, cfg["roi"])[0] for dets in per_frame),
            default=0
        )
        self.assertGreaterEqual(len(unique), max_active)


# ---------------------------------------------------------------------------
# Full VideoProcessor pipeline
# ---------------------------------------------------------------------------
@unittest.skipUnless(HAS_TEST_VIDEO, "test_traffic.mp4 not found; skipping VideoProcessor tests")
class TestVideoProcessorReport(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        print("\n[test_stage2] Running VideoProcessor.process_video_file()...")
        from ml.inference.detector import YOLODetector
        from ml.inference.video_processor import VideoProcessor
        det = YOLODetector("yolov8n.pt")
        vp = VideoProcessor(detector=det)
        cls.report = vp.process_video_file(_TEST_VIDEO, conf_threshold=0.25, max_samples=5)
        print(f"[test_stage2] Report keys: {list(cls.report.keys())}")

    def _req(self, key):
        self.assertIn(key, self.report, f"Required field '{key}' missing from report")

    # Stage 1 fields
    def test_s1_id(self):           self._req("id")
    def test_s1_mode(self):         self._req("mode")
    def test_s1_engine(self):       self._req("inferenceEngine")
    def test_s1_real(self):         self._req("isRealModelInference")
    def test_s1_device(self):       self._req("device")
    def test_s1_generated(self):    self._req("generatedAt")
    def test_s1_time_ms(self):      self._req("processingTimeMs")
    def test_s1_video(self):        self._req("video")
    def test_s1_counts(self):       self._req("vehicleCounts")
    def test_s1_traffic(self):      self._req("trafficAnalysis")
    def test_s1_road_issues(self):  self._req("roadIssues")
    def test_s1_timeline(self):     self._req("detectionTimeline")
    def test_s1_summary(self):      self._req("summary")
    def test_s1_sampled(self):      self._req("sampledFrames")
    def test_s1_processed(self):    self._req("processedFrames")

    # Stage 2 fields
    def test_s2_tracking_key(self):
        self.assertIn("tracking", self.report)

    def test_s2_active_vehicles(self):
        self.assertIn("activeVehicles", self.report["tracking"])
        self.assertIsInstance(self.report["tracking"]["activeVehicles"], (int, float))

    def test_s2_unique_seen(self):
        self.assertIn("uniqueVehiclesSeen", self.report["tracking"])

    def test_s2_density_valid(self):
        self.assertIn(self.report["tracking"]["trafficDensity"], {"LOW", "MEDIUM", "HIGH"})

    def test_s2_congestion_valid(self):
        self.assertIn(self.report["tracking"]["congestionLevel"], {"LOW", "MEDIUM", "HIGH"})

    def test_s2_motion_score(self):
        score = self.report["tracking"]["relativeMotionScorePixels"]
        self.assertIsInstance(score, (int, float))
        self.assertGreaterEqual(score, 0.0)

    def test_s2_tracks_list(self):
        self.assertIsInstance(self.report.get("tracks"), list)

    def test_s2_trajectory_maxlen(self):
        for track in self.report["tracks"]:
            self.assertLessEqual(len(track.get("trajectory", [])), 30)

    def test_s2_track_motion_score_numeric(self):
        for track in self.report["tracks"]:
            self.assertIsInstance(track.get("relativeMotionScore"), (int, float))

    def test_s2_annotated_frames(self):
        for frame in self.report.get("processedFrames", []):
            self.assertIn("annotatedFrameDataUrl", frame)
            self.assertTrue(frame["annotatedFrameDataUrl"].startswith("data:image"))

    def test_s2_unique_gte_active(self):
        t = self.report["tracking"]
        self.assertGreaterEqual(t["uniqueVehiclesSeen"], t["activeVehicles"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
