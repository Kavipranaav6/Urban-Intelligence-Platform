# UrbanSense AI

> **SIH Problem Statement 26124**: AI-Powered Mobile Urban Intelligence Platform Using Public Transport Fleet.

UrbanSense AI turns public transit buses into mobile urban surveillance and intelligence edge nodes. Using on-board computer vision models (YOLOv8) and edge processing, buses capture road conditions, detect vehicle counts, monitor traffic density, and ingest real-time urban events to the central municipal dashboard.

---

## System Architecture

```
[ Recorded / Live Bus Camera ]
             ↓
[ Laptop = Edge Computer Node ]
             ↓
[ Python ML Service (YOLOv8 PyTorch) ] ← Runs on Port 8000
   • OpenCV Video Frame Capture
   • Real YOLO Object Detection (cars, buses, trucks, motorcycles, pedestrians)
   • Bounding Box Normalization & Frame Annotation
   • Real-time Vehicle Counting
             ↓ (Lightweight JSON Event Payload)
[ Central Express Backend ] ← Runs on Port 3000
   • Multi-bus Spatial Fusion
   • UrbanEvent Schema Ingestion
             ↓
[ React + TypeScript GIS Dashboard ]
   • Live Fleet Tracking
   • Dynamic Bounding Box Overlay Video Player
   • Central Alerts & GIS Traffic Heatmaps
```

---

## Quick Start & Testing Instructions

### Prerequisites
- **Node.js**: v18+ and `npm` or `bun`
- **Python**: 3.10 to 3.14

---

### Step 1: Start Python Edge ML Service (Port 8000)

1. Open a terminal and navigate to the project directory:
   ```bash
   cd c:\urbansense-AI\urbansense-AI-main
   ```
2. Create and activate Python virtual environment:
   - **Windows PowerShell**:
     ```powershell
     python -m venv ml/venv
     .\ml\venv\Scripts\Activate.ps1
     ```
3. Install ML dependencies:
   ```bash
   pip install -r ml/requirements.txt
   ```
4. Run the ML server:
   ```bash
   python -m ml.api.ml_server
   ```
   *Expected Output*: `[ML Server] Starting UrbanSense ML Server on http://127.0.0.1:8000`

---

### Step 2: Start Central Application & Dashboard (Port 3000)

1. Open a second terminal:
   ```bash
   cd c:\urbansense-AI\urbansense-AI-main
   ```
2. Install npm dependencies (if not already installed):
   ```bash
   npm install
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

### Step 3: Test Real YOLO Video Analysis

1. On the UrbanSense AI Dashboard, navigate to the **Edge Camera Feed / Video Upload** section.
2. Observe the badge: **`PYTHON EDGE ML: YOLOv8 ONLINE`**.
3. Click **Upload Road Video** (or select a preset test video).
4. Click **Run AI Analysis**.
5. Watch the processing pipeline:
   - OpenCV reads video frames.
   - YOLOv8 runs real object detection.
   - Real bounding boxes and labels (`CAR 92%`, `TRUCK 94%`, `BUS 96%`, `PERSON 88%`) display on the video overlay.
   - Vehicle counts (`cars`, `buses`, `trucks`, `motorcycles`, `bicycles`, `pedestrians`) are calculated and populated into the dashboard widgets and GIS map.

---

## Component Communication

- **Frontend → Backend**: React app communicates with Express server at `http://localhost:3000/api/*`.
- **Backend → ML Service**: Express server proxies video frame analysis to `http://127.0.0.1:8000/analyze-frames` or `http://127.0.0.1:8000/analyze-video`.
- **Direct ML Health Check**: Frontend & backend poll `http://127.0.0.1:8000/health` to confirm Python ML service availability.

---

## Hardware Fallback

The Python ML service automatically checks for NVIDIA CUDA capability (`torch.cuda.is_available()`):
- **NVIDIA GPU available**: Executes YOLO inference on `cuda:0` for high FPS throughput.
- **CPU only**: Falls back automatically to CPU execution without throwing errors.

---

## Stage 2: ByteTrack Multi-Object Tracking & Traffic Analytics

Stage 2 upgrades the YOLOv8 detection pipeline with persistent multi-object tracking and traffic analytics.

### Stage 2 Pipeline

```
VIDEO
  ↓
Sequential frame reading (OpenCV)
  ↓
YOLOv8 detection (yolov8n.pt)
  ↓
ByteTrack (Ultralytics model.track, persist=True)
  ↓  → Persistent track IDs across consecutive frames
  ↓  → Trajectory history (max 30 points per track)
  ↓  → Relative motion score (pixel displacement, NOT speed)
  ↓
ROI filtering (normalized coordinates, config.yaml)
  ↓
Traffic density: LOW / MEDIUM / HIGH
  ↓
Congestion estimation: LOW / MEDIUM / HIGH
  ↓
API response (new 'tracking' + 'tracks' fields added)
  ↓
React UrbanSense Dashboard (Vehicles tab: ByteTrack Analytics panel)
```

### New Analytics Fields (API Response)

The `/analyze-video` and `/analyze-frames` endpoints now return additional fields alongside all existing Stage 1 fields:

```json
{
  "tracking": {
    "tracker": "ByteTrack",
    "activeVehicles": 10,
    "uniqueVehiclesSeen": 23,
    "trafficDensity": "MEDIUM",
    "congestionLevel": "MEDIUM",
    "relativeMotionScorePixels": 4.82,
    "vehicleCounts": { "car": 6, "motorcycle": 2, "bus": 1, "truck": 1 },
    "roiConfig": { "x_min": 0.10, "y_min": 0.35, "x_max": 0.90, "y_max": 0.95 }
  },
  "tracks": [
    {
      "track_id": 17,
      "class": "car",
      "trajectory": [{ "frameIndex": 0, "centerX": 210.0, "centerY": 290.0 }],
      "relativeMotionScore": 4.82
    }
  ]
}
```

### Configuration (`ml/inference/config.yaml`)

```yaml
roi:
  x_min: 0.10   # normalized [0..1]
  y_min: 0.35
  x_max: 0.90
  y_max: 0.95

density:        # prototype thresholds
  low_max: 5
  medium_max: 12

congestion:
  low_max: 5
  medium_max: 12
```

### Running Stage 2 Tests

```bash
# Analytics-only tests (no GPU / video required — runs instantly):
python -m pytest ml/tests/test_stage2.py::TestAnalyticsHelpers -v

# Full integration tests (requires test_traffic.mp4 + YOLOv8 model):
python -m pytest ml/tests/test_stage2.py -v
```

### Stage 2 Limitations

> These limitations apply to this prototype implementation and must be stated clearly.

- **ByteTrack is not Re-ID.** Track IDs can change after long occlusions or when a vehicle leaves and re-enters the frame. ByteTrack does not use appearance features for cross-occlusion identity recovery.
- **Moving camera reduces tracking stability.** The bus camera is in motion. Camera movement causes background objects to appear to move, which can interfere with track continuity.
- **Relative motion is NOT vehicle speed.** The `relativeMotionScorePixels` field reports pixel displacement between consecutive tracker observations in image space. Without camera calibration, road geometry, and perspective correction, this cannot be converted to km/h and must not be labelled as speed.
- **ROI and density thresholds are prototype values.** The thresholds in `config.yaml` are starting points. They must be calibrated against real traffic data for each deployment site and camera angle.
- **Congestion classification is a prototype heuristic.** The current congestion model uses vehicle count and relative motion as a proxy. It does not implement traffic engineering standards.
- **Results depend on video quality.** Poor lighting, low frame rate, severe motion blur, or partial occlusion reduce both detection accuracy and tracking stability.
- **No unsupported claims.** We do not claim 100% accurate tracking, real speed measurement, or production-grade traffic counting.

---

## STAGE 3 — Road & Infrastructure Hazard Detection

Stage 3 introduces AI-assisted road surface and infrastructure hazard detection alongside the existing vehicle tracking pipeline without altering vehicle inference or ByteTrack state.

### Stage 3 Architecture: Decoupled Processing

```
VIDEO FRAME
    |
    +--> VEHICLE DETECTION (YOLOv8)
    |       |
    |       +--> BYTE TRACKING (Ultralytics persist=True)
    |       |
    |       +--> TRAFFIC ANALYTICS (Active ROI, Density, Congestion, Motion)
    |
    +--> HAZARD DETECTION (HazardDetector — Separate Concern)
            |
            +--> Class Normalization (Pothole, Waterlogging, Road Damage, Sign)
            +--> Hazard ROI Filtering (Pavement / Surface priority)
            +--> Severity Classification (HIGH / MEDIUM / LOW prototype score)
            +--> Temporal/Spatial Deduplication (HazardIncidentTracker)
            +--> Evidence Frame Annotation (Base64 JPEG with defect overlay)
            +--> Standardized Incident Record (HAZ-xxxx)
```

> **CRITICAL ARCHITECTURAL BOUNDARY:**
> Vehicle tracking and hazard detection are strictly separate concerns. Hazards are **NEVER** fed into ByteTrack's vehicle tracker.

### Supported Hazard Classes

- **Potholes**: Cavities, surface depressions, and open/damaged manholes.
- **Waterlogging**: Puddles, surface ponding, and flooded pavement patches.
- **Road Damage / Cracks**: Linear cracking, alligator cracking, fissures, and surface rutting.
- **Traffic Signs**: Damaged, tilted, missing, or obscured road signage.

The architecture uses centralized normalization (`normalize_hazard_class`) so model-specific class names (e.g. `crack`, `pit`, `flood`) map into standardized categories while unknown objects remain `"unknown"` rather than being misclassified.

### Hazard Model Configuration & Fallback State

Configured in `ml/inference/config.yaml`:
```yaml
hazard:
  model_path: "ml/models/hazard_yolov8.pt"
  frame_interval: 5       # Sample hazard inference every 5th frame
  conf_threshold: 0.30
  roi:
    x_min: 0.05
    y_min: 0.35
    x_max: 0.95
    y_max: 1.00
  severity:
    high_area: 0.08
    medium_area: 0.025
    high_confidence: 0.85
    medium_confidence: 0.60
  deduplication:
    time_window_seconds: 5.0
    distance_pixels: 100.0
```

- **Graceful Fallback Mode**: If trained custom hazard weights (`hazard_yolov8.pt`) are absent, `HazardDetector` automatically runs in fallback mode (`is_available = False`). The system logs a clear notice, returns an empty hazard list without crashing, and allows vehicle tracking and Stage 1/2 traffic analytics to run with zero disruption.
- **Enabling Custom Weights**: Place custom-trained YOLO weights at `ml/models/hazard_yolov8.pt` (or update `model_path` in `config.yaml`).

### Prototype Severity Scoring

Severity is computed deterministically using image-space normalized bounding-box area and detection confidence:
- **HIGH**: Large normalized bbox area ($\ge 8\%$ of frame) or high confidence ($\ge 85\%$).
- **MEDIUM**: Moderate normalized area ($\ge 2.5\%$) or moderate confidence ($\ge 60\%$).
- **LOW**: Small or lower-confidence defect.

> **SAFETY & INTEGRITY NOTE:**
> Severity classification is a prototype prioritization score for maintenance dispatch. It does **NOT** represent physical pothole depth in centimeters, pavement condition index (PCI), or an official civil engineering safety certification.

### Temporal & Spatial Deduplication

A physical defect visible across dozens of consecutive video frames must not generate dozens of duplicate tickets:
- `HazardIncidentTracker` evaluates detection center distances and timestamps against open incidents.
- Detections within `distance_pixels` (default 100 px) and `time_window_seconds` (default 5.0s) update the existing incident, tracking peak confidence, upgrading severity if warranted, and updating the evidence image thumbnail.
- New distinct defects generate clean sequential incident IDs (`HAZ-0001`, `HAZ-0002`).

### GIS / Telemetry Preparation

In accordance with SIH 2026 PS 26124:
- Image pixel coordinates are never converted into fake GPS coordinates.
- Incidents store `"location": {"latitude": null, "longitude": null}` with documented status: *GPS integration will populate when live bus telemetry stream is connected*.

### Incident Lifecycle Management

- Prototype incident records support interactive status transitions: `NEW` $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `RESOLVED`.
- Operators can cycle incident statuses directly from the dashboard audit table.

### Prototype vs. Real Deployment

| Attribute | Prototype (Current) | Real Smart City Deployment |
| :--- | :--- | :--- |
| **Compute Location** | Local PC / Server processes uploaded bus video | Edge AI compute (e.g. Jetson Orin) mounted directly inside bus |
| **Video Processing** | Full video uploaded over network | Real-time on-bus processing; raw video discarded |
| **Network Payload** | Full video or sampled frames base64 | Compact JSON incident packets (<1 KB) with thumbnail over 4G/5G |
| **Geolocation** | Telemetry pending (`location: null`) | Hardwired GNSS/GPS receiver tagging exact bus coordinates |
| **Database** | Session audit report | Centralized municipal GIS spatial database & work-order dispatch |

### Running Stage 3 Tests

```bash
# Run all Stage 3 Unit & Integration Tests (28 tests):
python -m pytest ml/tests/test_stage3.py -v

# Run the complete test suite (Stages 1, 2, and 3 - 75 tests):
python -m pytest ml/tests/ -v
```

