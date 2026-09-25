import os
import torch
import numpy as np
from PIL import Image
from typing import List, Dict, Any, Union

# Target classes supported in Stage 1 (COCO dataset vehicle & pedestrian classes)
TARGET_CLASS_IDS = {
    0: 'person',
    1: 'bicycle',
    2: 'car',
    3: 'motorcycle',
    5: 'bus',
    7: 'truck'
}

CLASS_COLOR_MAP = {
    'car': '#06b6d4',         # Cyan
    'bus': '#3b82f6',         # Blue
    'truck': '#a855f7',       # Purple
    'motorcycle': '#10b981',  # Emerald
    'bicycle': '#84cc16',     # Lime
    'person': '#f43f5e'       # Rose
}

class YOLODetector:
    def __init__(self, model_name: str = 'yolov8n.pt'):
        """
        Initialize YOLO model with automatic CUDA GPU / CPU fallback.
        """
        # Determine execution device
        has_cuda = hasattr(torch, 'cuda') and torch.cuda.is_available()
        if has_cuda:
            self.device = 'cuda'
            self.device_name = torch.cuda.get_device_name(0)
        else:
            self.device = 'cpu'
            self.device_name = 'CPU (Fallback)'

        print(f"[YOLODetector] Initializing model '{model_name}' on device: {self.device_name}")

        # Lazy import of ultralytics to allow fast module import
        from ultralytics import YOLO

        # Save model inside ml/models/ directory
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        models_dir = os.path.join(base_dir, 'models')
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, model_name)

        if os.path.exists(model_path):
            self.model = YOLO(model_path)
        else:
            print(f"[YOLODetector] Downloading pretrained {model_name} model to {models_dir}...")
            self.model = YOLO(model_name)
            # Save a copy to models_dir if not already saved there
            try:
                self.model.save(model_path)
            except Exception:
                pass

    def get_device_info(self) -> Dict[str, Any]:
        return {
            "device": self.device,
            "deviceName": self.device_name,
            "cudaAvailable": bool(hasattr(torch, 'cuda') and torch.cuda.is_available()),
            "torchVersion": getattr(torch, '__version__', 'unknown')
        }

    def track_video(self, video_path: str, conf_threshold: float = 0.25) -> List[List[Dict[str, Any]]]:
        """Run ByteTrack on the entire video and return per-frame detections.

        Strategy: open the video with OpenCV and pass each BGR numpy frame
        individually to model.track(persist=True). This avoids the torchvision
        video-source setup path (which causes NMS registration errors on some
        environments) while preserving full ByteTrack ID persistence because
        persist=True keeps the tracker state across consecutive calls.

        Each detection dict includes 'track_id' from result.boxes.id.
        """
    def track_frame(
        self,
        frame: np.ndarray,
        conf_threshold: float = 0.25,
        persist: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Stage 2: Run YOLOv8 + ByteTrack tracking on a single frame.
        When persist=True, tracker state carries over across consecutive calls
        for the same video sequence.
        Returns detection objects including 'track_id', 'bboxPixels', and 'center'.
        """
        if frame is None or frame.size == 0:
            return []

        height, width = frame.shape[:2]

        # Pass numpy BGR frame to tracker; persist=True keeps ByteTrack state
        results = self.model.track(
            source=frame,
            tracker="bytetrack.yaml",
            persist=persist,
            conf=conf_threshold,
            device=self.device,
            verbose=False,
        )

        detections: List[Dict[str, Any]] = []
        if not results or len(results) == 0:
            return detections

        res = results[0]
        boxes = res.boxes
        if boxes is None or len(boxes) == 0:
            return detections

        for i, box in enumerate(boxes):
            cls_id = int(box.cls[0].item())
            if cls_id not in TARGET_CLASS_IDS:
                continue
            cls_name = TARGET_CLASS_IDS[cls_id]
            conf_val = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()
            xmin, ymin, xmax, ymax = xyxy[0], xyxy[1], xyxy[2], xyxy[3]

            norm_x = max(0.0, min(1.0, xmin / width)) if width else 0.0
            norm_y = max(0.0, min(1.0, ymin / height)) if height else 0.0
            norm_w = max(0.01, min(1.0 - norm_x, (xmax - xmin) / width)) if width else 0.0
            norm_h = max(0.01, min(1.0 - norm_y, (ymax - ymin) / height)) if height else 0.0

            color = CLASS_COLOR_MAP.get(cls_name, '#06b6d4')
            track_id = int(box.id[0].item()) if (hasattr(box, 'id') and box.id is not None) else -1
            if track_id >= 0:
                label = f"{cls_name.upper()} #{track_id} {int(conf_val * 100)}%"
            else:
                label = f"{cls_name.upper()} {int(conf_val * 100)}%"

            center_x = round((xmin + xmax) / 2.0, 1)
            center_y = round((ymin + ymax) / 2.0, 1)

            detections.append({
                "id": f"yolo-det-{i}",
                "track_id": track_id,
                "class": cls_name,
                "label": label,
                "confidence": round(conf_val * 100, 1),
                "x": round(norm_x, 4),
                "y": round(norm_y, 4),
                "width": round(norm_w, 4),
                "height": round(norm_h, 4),
                "color": color,
                "bboxPixels": [round(xmin, 1), round(ymin, 1), round(xmax, 1), round(ymax, 1)],
                "center": [center_x, center_y],
            })

        return detections

    def track_video(self, video_path: str, conf_threshold: float = 0.25) -> List[List[Dict[str, Any]]]:
        """
        Sequential ByteTrack inference on a video file.
        Reads frames in strict sequential order, keeping tracker state
        across consecutive frames via persist=True.
        """
        import cv2
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found at path: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video for tracking: {video_path}")

        per_frame_detections: List[List[Dict[str, Any]]] = []
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            detections = self.track_frame(frame, conf_threshold=conf_threshold, persist=True)
            per_frame_detections.append(detections)
            frame_idx += 1

        cap.release()
        print(f"[YOLODetector] ByteTrack complete: {frame_idx} frames processed.")
        return per_frame_detections


    def detect_frame(self, frame: np.ndarray, conf_threshold: float = 0.25) -> List[Dict[str, Any]]:
        """
        Perform YOLO inference on a single OpenCV BGR frame.
        Returns a list of structured detection objects.
        """
        if frame is None or frame.size == 0:
            return []

        height, width = frame.shape[:2]

        # Run inference
        results = self.model.predict(
            source=frame,
            device=self.device,
            conf=conf_threshold,
            verbose=False
        )

        detections = []

        if not results or len(results) == 0:
            return detections

        res = results[0]
        boxes = res.boxes

        if boxes is None or len(boxes) == 0:
            return detections

        for i, box in enumerate(boxes):
            cls_id = int(box.cls[0].item())

            # Filter for target classes (car, bus, truck, motorcycle, bicycle, person)
            if cls_id not in TARGET_CLASS_IDS:
                continue

            cls_name = TARGET_CLASS_IDS[cls_id]
            conf = float(box.conf[0].item())

            # Bounding box in xyxy (pixels)
            xyxy = box.xyxy[0].tolist()
            xmin, ymin, xmax, ymax = xyxy[0], xyxy[1], xyxy[2], xyxy[3]

            # Calculate normalized [0..1] coordinates
            norm_x = max(0.0, min(1.0, xmin / width))
            norm_y = max(0.0, min(1.0, ymin / height))
            norm_w = max(0.01, min(1.0 - norm_x, (xmax - xmin) / width))
            norm_h = max(0.01, min(1.0 - norm_y, (ymax - ymin) / height))

            color = CLASS_COLOR_MAP.get(cls_name, '#06b6d4')
            label = f"{cls_name.upper()} {int(conf * 100)}%"

            detections.append({
                "id": f"yolo-det-{i}",
                "class": cls_name,
                "label": label,
                "confidence": round(conf * 100, 1),
                "x": round(norm_x, 4),
                "y": round(norm_y, 4),
                "width": round(norm_w, 4),
                "height": round(norm_h, 4),
                "color": color,
                "bboxPixels": [round(xmin, 1), round(ymin, 1), round(xmax, 1), round(ymax, 1)]
            })

        return detections
