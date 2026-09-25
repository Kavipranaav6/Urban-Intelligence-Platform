# UrbanSense AI - Python Edge ML Service (Stage 1)

AI-Powered Mobile Urban Intelligence Platform Using Public Transport Fleet.

This directory contains the Python Edge-AI service providing **Real YOLO Object Detection and Vehicle Counting** for UrbanSense AI (Smart India Hackathon Problem Statement 26124).

---

## Technical Features (Stage 1)

1. **Real Object Detection**: Powered by PyTorch & Ultralytics `YOLOv8n` pretrained model on COCO vehicle classes:
   - `car`
   - `motorcycle`
   - `bus`
   - `truck`
   - `bicycle`
   - `person` (pedestrian)
2. **OpenCV Video Processor**: Reads video frames, samples at configurable intervals, performs real YOLO inference, draws normalized bounding boxes, and calculates vehicle counts.
3. **Hardware Acceleration**: Automatically detects NVIDIA CUDA GPU (`cuda:0`). Falls back seamlessly to CPU if CUDA is unavailable.
4. **Zero Fake Detections**: 100% of bounding boxes and vehicle counts originate directly from real YOLO model inference over actual video frames.
5. **Simulated Edge Computer**: Runs locally on laptop (representing bus on-board edge computer), transmitting only lightweight structured event payloads and annotated evidence frames to the central backend.

---

## Directory Structure

```
ml/
├── api/
│   ├── __init__.py
│   └── ml_server.py      # FastAPI server exposing GET /health, POST /analyze-video, POST /analyze-frames
├── inference/
│   ├── __init__.py
│   ├── detector.py       # YOLODetector class wrapping PyTorch YOLOv8 & device fallback
│   └── video_processor.py # OpenCV video reader, frame sampler, overlay renderer, vehicle counter
├── models/               # Cached model weights (yolov8n.pt)
├── requirements.txt      # Python dependencies (ultralytics, torch, opencv, fastapi, etc.)
└── README.md
```

---

## Quick Setup & Start Guide

### Prerequisites
- Python 3.10 to 3.14 installed on your system.

### Step 1: Create Virtual Environment
```bash
python -m venv ml/venv
```

### Step 2: Activate Virtual Environment
- **Windows (PowerShell)**:
  ```powershell
  .\ml\venv\Scripts\Activate.ps1
  ```
- **Windows (CMD)**:
  ```cmd
  .\ml\venv\Scripts\activate.bat
  ```
- **Linux/macOS**:
  ```bash
  source ml/venv/bin/activate
  ```

### Step 3: Install Dependencies
```bash
pip install -r ml/requirements.txt
```

### Step 4: Start the ML Service
```bash
python -m ml.api.ml_server
```
*The service will start on `http://127.0.0.1:8000`.*

---

## API Documentation

### Health Check
`GET http://127.0.0.1:8000/health`

Returns service status, device info (CUDA/CPU), model name, and supported classes.

### Analyze Video File
`POST http://127.0.0.1:8000/analyze-video`

Form-data parameters:
- `file`: MP4/AVI/MOV video file upload
- `conf_threshold`: Confidence threshold (default `0.25`)
- `max_samples`: Number of frames to sample (default `10`)
- `bus_id`: Bus identifier (default `BUS-103`)

### Analyze Sampled Base64 Frames
`POST http://127.0.0.1:8000/analyze-frames`

JSON payload containing `videoMetadata` and `sampledFrames` array. Returns structured `UploadedVideoReport`.
