"""
Stage 4 - Offending Vehicle Detection: Hit-and-Run & Rash Driving
Tests: ANPRDetector + IncidentDetector pipeline integration
"""

import sys
import os
import pytest
import base64

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from inference.anpr_detector import ANPRDetector
from inference.incident_detector import IncidentDetector


def _tiny_base64_frame():
    PNG_1X1 = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00'
        b'\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8'
        b'\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    return base64.b64encode(PNG_1X1).decode()


_FRAME = _tiny_base64_frame()

_MOCK_DETECTION = {
    'track_id': 17,
    'class_name': 'car',
    'class_id': 2,
    'confidence': 0.91,
    'bbox': [100, 200, 300, 350],
}

_MOCK_TRAJECTORY = {
    'track_id': 17,
    'frames': 28,
    'positions': [(100, 200), (110, 210), (140, 220), (190, 240)],
    'speed_kmh': 82.0,
    'avg_speed_kmh': 75.0,
    'speed_variance': 12.5,
    'direction_changes': 3,
    'lane_changes': 2,
    'proximity_violations': 1,
}

_MOCK_GPS = {
    'latitude': 11.0082,
    'longitude': 76.9845,
    'location_name': 'Lakshmi Mills Junction',
}


class TestANPRDetector:
    def setup_method(self):
        self.detector = ANPRDetector()

    def test_instantiation(self):
        assert self.detector is not None

    def test_analyze_frame_returns_list(self):
        result = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        assert isinstance(result, list)

    def test_analyze_frame_empty_detections(self):
        result = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[],
            timestamp='00:00', timestamp_sec=0.0)
        assert isinstance(result, list)

    def test_anpr_record_structure(self):
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        for rec in results:
            assert 'id' in rec
            assert 'plateNumber' in rec
            assert 'confidence' in rec
            assert 'readable' in rec
            assert 'timestamp' in rec
            assert 'timestampSec' in rec
            assert 'evidenceFrame' in rec
            assert 0.0 <= rec['confidence'] <= 100.0

    def test_anpr_plate_is_string(self):
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        for rec in results:
            assert isinstance(rec['plateNumber'], str) and len(rec['plateNumber']) > 0

    def test_anpr_readable_is_bool(self):
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        for rec in results:
            assert isinstance(rec['readable'], bool)

    def test_anpr_get_summary_empty(self):
        summary = self.detector.get_summary()
        assert isinstance(summary, dict)
        assert 'total_plates_detected' in summary

    def test_anpr_summary_after_analysis(self):
        self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        summary = self.detector.get_summary()
        assert summary['total_plates_detected'] >= 0

    def test_anpr_reset(self):
        self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        self.detector.reset()
        assert self.detector.get_summary()['total_plates_detected'] == 0


class TestIncidentDetector:
    def setup_method(self):
        self.detector = IncidentDetector()

    def test_instantiation(self):
        assert self.detector is not None

    def test_analyze_frame_returns_list(self):
        result = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        assert isinstance(result, list)

    def test_analyze_frame_no_detections(self):
        result = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[],
            trajectories={}, anpr_results=[],
            timestamp='00:00', timestamp_sec=0.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        assert isinstance(result, list)

    def test_incident_record_structure(self):
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        for rec in results:
            assert 'id' in rec
            assert 'incidentType' in rec
            assert 'trackId' in rec
            assert 'confidence' in rec
            assert 'severity' in rec
            assert 'latitude' in rec
            assert 'longitude' in rec
            assert 'timestamp' in rec
            assert 'realTimestamp' in rec
            assert 'busId' in rec
            assert rec['incidentType'] in ('HIT_AND_RUN', 'RASH_DRIVING')
            assert rec['severity'] in ('CRITICAL', 'HIGH')
            assert 0 <= rec['confidence'] <= 100

    def test_gps_binding(self):
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        for rec in results:
            assert abs(rec['latitude'] - 11.0082) < 0.01
            assert abs(rec['longitude'] - 76.9845) < 0.01

    def test_plate_binding(self):
        anpr_result = {
            'id': 'ANPR-TEST-001', 'trackId': 17,
            'plateNumber': 'TN 38 AB 1234', 'confidence': 93.5,
            'readable': True, 'timestamp': '00:32',
            'timestampSec': 32.0, 'evidenceFrame': _FRAME,
        }
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[anpr_result],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        for rec in results:
            if rec['trackId'] == 17:
                assert 'plateNumber' in rec
                assert isinstance(rec['plateNumber'], str)

    def test_bus_id_bound(self):
        results = self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        for rec in results:
            assert rec['busId'] == 'BUS-103'

    def test_get_summary_empty(self):
        summary = self.detector.get_summary()
        assert isinstance(summary, dict)
        assert 'totalSafetyIncidents' in summary
        assert 'hitAndRunCount' in summary
        assert 'rashDrivingCount' in summary

    def test_summary_counts(self):
        self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        summary = self.detector.get_summary()
        assert summary['totalSafetyIncidents'] >= 0
        assert summary['hitAndRunCount'] >= 0
        assert summary['rashDrivingCount'] >= 0

    def test_reset(self):
        self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        self.detector.reset()
        assert self.detector.get_summary()['totalSafetyIncidents'] == 0

    def test_get_all_incidents(self):
        self.detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        assert isinstance(self.detector.get_all_incidents(), list)

    def test_deduplication(self):
        for _ in range(3):
            self.detector.analyze_frame(
                frame_b64=_FRAME, detections=[_MOCK_DETECTION],
                trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
                timestamp='00:32', timestamp_sec=32.0,
                gps_data=_MOCK_GPS, bus_id='BUS-103')
        track_17 = [inc for inc in self.detector.get_all_incidents()
                    if inc.get('trackId') == 17]
        assert len(track_17) <= 1, f"Duplicate incidents for trackId=17: {len(track_17)}"


class TestANPRIncidentPipeline:
    def setup_method(self):
        self.anpr = ANPRDetector()
        self.incident_detector = IncidentDetector()

    def test_pipeline_end_to_end(self):
        anpr_results = self.anpr.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        incident_results = self.incident_detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=anpr_results,
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        assert isinstance(anpr_results, list)
        assert isinstance(incident_results, list)

    def test_pipeline_summary_integrity(self):
        self.anpr.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            timestamp='00:32', timestamp_sec=32.0)
        assert self.anpr.get_summary()['total_plates_detected'] >= 0

        self.incident_detector.analyze_frame(
            frame_b64=_FRAME, detections=[_MOCK_DETECTION],
            trajectories={17: _MOCK_TRAJECTORY}, anpr_results=[],
            timestamp='00:32', timestamp_sec=32.0,
            gps_data=_MOCK_GPS, bus_id='BUS-103')
        s = self.incident_detector.get_summary()
        assert s['hitAndRunCount'] + s['rashDrivingCount'] <= s['totalSafetyIncidents']
