"""
test_anpr.py - ANPR pipeline end-to-end tests

Tests:
  1. No fake/hardcoded plates - plate output is always either real OCR or empty.
  2. format_plate_number / PLATE_REGEX validation.
  3. extract_registration returns correct schema (no fake fields).
  4. _run_ocr on a real synthetic plate image.
  5. IncidentDetector.update_frame does NOT produce incidents from data-free frames.
"""

import sys
import os
import math
import numpy as np
import cv2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from ml.inference.anpr_detector import (
    ANPRDetector,
    format_plate_number,
    PLATE_REGEX,
    parse_state_and_region,
)
from ml.inference.incident_detector import IncidentDetector


def make_plate_image(text, width=300, height=80):
    img = np.ones((height, width, 3), dtype=np.uint8) * 255
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 1.6
    thickness = 3
    text_size, _ = cv2.getTextSize(text, font, scale, thickness)
    tx = max(0, (width - text_size[0]) // 2)
    ty = max(text_size[1], (height + text_size[1]) // 2)
    cv2.putText(img, text, (tx, ty), font, scale, (0, 0, 0), thickness, cv2.LINE_AA)
    return img


def make_vehicle_frame_with_plate(plate_text):
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    vx1, vy1, vx2, vy2 = 200, 200, 500, 500
    cv2.rectangle(frame, (vx1, vy1), (vx2, vy2), (80, 80, 80), -1)
    plate_img = make_plate_image(plate_text, width=120, height=35)
    vh = vy2 - vy1
    vw = vx2 - vx1
    px = vx1 + (vw - 120) // 2
    py = vy1 + int(vh * 0.72)
    frame[py:py+35, px:px+120] = plate_img
    return frame, [float(vx1), float(vy1), float(vx2), float(vy2)]


class TestPlateRegex:
    def test_valid_plate_formats(self):
        valid_plates = ["TN 38 AB 1234", "KA 01 MJ 8821", "DL 03 C 4912", "MH 12 XY 5678"]
        for p in valid_plates:
            assert PLATE_REGEX.match(p), f"Expected valid: {p}"

    def test_invalid_plate_rejected(self):
        invalid = ["", "ABCDEFG", "12345678", "XX 999 ZZZ 00001"]
        for p in invalid:
            assert not PLATE_REGEX.match(p), f"Expected invalid: {p}"

    def test_format_plate_number_normalises(self):
        formatted = format_plate_number("TN38AB1234")
        assert PLATE_REGEX.match(formatted), f"Normalised form should match: {formatted}"

    def test_format_plate_number_handles_spaces(self):
        formatted = format_plate_number("KA 01 MJ 8821")
        assert PLATE_REGEX.match(formatted)


class TestDisambiguationSanity:
    """Tests confirming disambiguation does not corrupt other states/series with HL, ML, or KO."""

    def test_other_state_plates_not_corrupted(self):
        test_plates = [
            ("TN38HL1234", "TN 38 HL 1234"),
            ("MH12ML5678", "MH 12 ML 5678"),
            ("KO01AB1234", "KO 01 AB 1234"),
            ("DL03HL9999", "DL 03 HL 9999"),
            ("KA01ML4444", "KA 01 ML 4444"),
        ]
        for raw, expected in test_plates:
            formatted = format_plate_number(raw)
            assert formatted == expected, f"Plate {raw} was corrupted to {formatted}!"
            assert PLATE_REGEX.match(formatted), f"Plate {formatted} failed regex!"

    def test_positional_character_repair(self):
        assert format_plate_number("KAOSNL9156") == "KA 05 NL 9156"
        assert format_plate_number("KAOSHL9156") == "KA 05 HL 9156"
        assert format_plate_number("KA05NL9156") == "KA 05 NL 9156"

    def test_border_artifact_stripping(self):
        # Leading frame boundary noise 'F'
        assert format_plate_number("FKAOSHL9156") == "KA 05 HL 9156"
        assert format_plate_number("FKAOSNL9156") == "KA 05 NL 9156"



class TestExtractRegistrationSchema:
    def setup_method(self):
        self.detector = ANPRDetector(min_confidence=65.0)

    def test_returns_required_keys(self):
        rec = self.detector.extract_registration(frame=None, vehicle_bbox=[100.0, 100.0, 300.0, 400.0], track_id=42, timestamp_sec=5.0, vehicle_class="car")
        required_keys = ["id","trackId","plateNumber","rawPlateNumber","readable","confidence","timestamp","timestampSec","stateOrRegion","stateName","vehicleClass","evidenceFrame","plateBbox"]
        for key in required_keys:
            assert key in rec, f"Missing key: {key}"

    def test_no_frame_gives_empty_plate(self):
        rec = self.detector.extract_registration(frame=None, vehicle_bbox=[0.0, 0.0, 50.0, 80.0], track_id=99)
        assert rec["confidence"] == 0.0
        assert rec["readable"] is False
        plate = rec["plateNumber"]
        assert plate == "" or plate is None or not PLATE_REGEX.match(str(plate)), f"Got fabricated plate: '{plate}'"

    def test_no_hardcoded_plate_for_tid_17(self):
        rec = self.detector.extract_registration(frame=None, vehicle_bbox=[0, 0, 100, 100], track_id=17)
        assert rec["plateNumber"] != "TN 38 AB 1234", "Hardcoded plate for tid==17 still present!"

    def test_no_hardcoded_plate_for_tid_21(self):
        rec = self.detector.extract_registration(frame=None, vehicle_bbox=[0, 0, 100, 100], track_id=21)
        assert rec["plateNumber"] != "KA 01 MJ 8821", "Hardcoded plate for tid==21 still present!"


class TestRunOcr:
    @pytest.mark.slow
    def test_ocr_on_synthetic_plate(self):
        try:
            import easyocr
        except ImportError:
            pytest.skip("EasyOCR not installed")
        from ml.inference.anpr_detector import _get_ocr_reader
        reader = _get_ocr_reader()
        if reader is None:
            pytest.skip("EasyOCR model not available")
        detector = ANPRDetector(min_confidence=30.0)
        plate_img = make_plate_image("TN38AB1234", width=320, height=90)
        text, conf = detector._run_ocr(plate_img)
        assert text != "", "OCR returned empty on clearly rendered plate"
        assert conf > 0.0
        print(f"\nOCR output: '{text}' @ {conf:.1f}%")

    @pytest.mark.slow
    def test_full_extract_registration_with_frame(self):
        try:
            import easyocr
        except ImportError:
            pytest.skip("EasyOCR not installed")
        from ml.inference.anpr_detector import _get_ocr_reader
        if _get_ocr_reader() is None:
            pytest.skip("EasyOCR model not available")
        detector = ANPRDetector(min_confidence=25.0)
        frame, bbox = make_vehicle_frame_with_plate("TN38AB1234")
        rec = detector.extract_registration(frame=frame, vehicle_bbox=bbox, track_id=5, timestamp_sec=10.0, vehicle_class="car")
        assert rec["evidenceFrame"].startswith("data:image"), "evidenceFrame must be base64 JPEG"
        print(f"\nFull-frame OCR: plate='{rec['plateNumber']}', conf={rec['confidence']:.1f}%, readable={rec['readable']}")


class TestIncidentDetectorClean:
    def setup_method(self):
        self.detector = IncidentDetector()

    def test_no_incident_from_empty_frame(self):
        incidents = self.detector.update_frame(frame_idx=0, timestamp_sec=0.0, detections=[])
        assert incidents == []

    def test_no_incident_with_insufficient_trajectory(self):
        det = {"track_id": 17, "class": "car", "bboxPixels": [100.0, 200.0, 300.0, 400.0]}
        for i in range(1, 3):
            incidents = self.detector.update_frame(frame_idx=i, timestamp_sec=float(i)*0.5, detections=[det])
            assert incidents == [], f"Fired at frame {i} with only {i} history points"

    def test_rash_driving_requires_actual_lateral_motion(self):
        self.detector.reset()
        for i in range(10):
            bbox = [100.0 + i*2, 200.0, 300.0 + i*2, 400.0]
            det = {"track_id": 17, "class": "car", "bboxPixels": bbox}
            incidents = self.detector.update_frame(frame_idx=i, timestamp_sec=float(i)*0.5, detections=[det])
            assert all(inc["incidentType"] != "RASH_DRIVING" for inc in incidents), f"Rash driving triggered by slow straight movement at frame {i}!"

    def test_no_incidents_for_tid_24_without_trigger(self):
        self.detector.reset()
        for i in range(10):
            det = {"track_id": 24, "class": "car", "bboxPixels": [200.0, 300.0, 400.0, 500.0]}
            incidents = self.detector.update_frame(frame_idx=i, timestamp_sec=float(i)*0.5, detections=[det])
            assert all(inc["incidentType"] != "HIT_AND_RUN" for inc in incidents), f"HIT_AND_RUN hardcoded for tid==24 at frame {i}!"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "not slow"])
