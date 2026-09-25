"""
ml/train_hazard.py - Fine-tunes YOLOv8 on Road Hazard & Pothole Dataset

UrbanSense AI: Mobile Urban Intelligence Platform
Fine-tunes from yolov8n.pt on Road Damage & Pothole datasets (RDD2022 / Roboflow).
After training, copies resulting best.pt to ml/models/hazard_yolov8.pt.

Usage:
    python ml/train_hazard.py --data path/to/data.yaml --epochs 50 --batch 16 --imgsz 640
"""

import os
import sys
import shutil
import argparse
from ultralytics import YOLO

def train_hazard_model(
    data_yaml: str,
    base_model: str = "ml/models/yolov8n.pt",
    epochs: int = 50,
    batch: int = 16,
    imgsz: int = 640,
    output_weights_path: str = "ml/models/hazard_yolov8.pt",
    device: str = "auto"
):
    print("=" * 65)
    print(" UrbanSense AI - Road Hazard & Pothole Model Fine-Tuning")
    print("=" * 65)
    print(f"Base Pretrained Model : {base_model}")
    print(f"Dataset YAML          : {data_yaml}")
    print(f"Epochs                : {epochs}")
    print(f"Batch Size            : {batch}")
    print(f"Image Resolution      : {imgsz}")
    print(f"Target Destination    : {output_weights_path}")
    print("=" * 65)

    if not os.path.exists(base_model):
        print(f"Base model '{base_model}' not found locally. Ultralytics will download pretrained yolov8n.pt...")
        base_model = "yolov8n.pt"

    if not os.path.exists(data_yaml):
        raise FileNotFoundError(f"Dataset YAML configuration '{data_yaml}' does not exist.")

    # 1. Load pretrained model (fine-tuning from pretrained, not from scratch)
    print(f"\n[1/4] Loading pretrained base model: {base_model}...")
    model = YOLO(base_model)

    # 2. Train / Fine-tune
    print(f"\n[2/4] Starting training run for {epochs} epochs...")
    train_results = model.train(
        data=data_yaml,
        epochs=epochs,
        batch=batch,
        imgsz=imgsz,
        device=device if device != "auto" else None,
        pretrained=True,
        save=True,
        plots=True,
        project="ml/runs",
        name="hazard_finetune",
        exist_ok=True,
        verbose=True
    )

    # 3. Validation and final mAP evaluation
    print(f"\n[3/4] Evaluating final validation mAP...")
    metrics = model.val(data=data_yaml, imgsz=imgsz)

    map50_95 = metrics.box.map
    map50 = metrics.box.map50
    map75 = metrics.box.map75

    print("\n" + "=" * 50)
    print(" Training Completed Successfully! Final Metrics:")
    print("=" * 50)
    print(f"  mAP50-95 (mean AP) : {map50_95:.4f}")
    print(f"  mAP50              : {map50:.4f}")
    print(f"  mAP75              : {map75:.4f}")
    print("=" * 50)

    # 4. Copy best.pt to target model path
    best_weights_path = os.path.join("ml/runs", "hazard_finetune", "weights", "best.pt")
    if os.path.exists(best_weights_path):
        os.makedirs(os.path.dirname(output_weights_path), exist_ok=True)
        shutil.copy(best_weights_path, output_weights_path)
        print(f"\n[4/4] Successfully deployed best weights to: {output_weights_path}")
        print(f"Weights file size: {os.path.getsize(output_weights_path):,} bytes")
    else:
        print(f"[Warning] best.pt not found at expected path: {best_weights_path}")

    return {
        "mAP50_95": map50_95,
        "mAP50": map50,
        "mAP75": map75,
        "weights": output_weights_path
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train / Fine-tune YOLOv8 Hazard Detector")
    parser.add_argument("--data", type=str, default="data.yaml", help="Path to data.yaml dataset definition")
    parser.add_argument("--base", type=str, default="ml/models/yolov8n.pt", help="Base model weights")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs (default: 50)")
    parser.add_argument("--batch", type=int, default=16, help="Batch size (default: 16)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size (default: 640)")
    parser.add_argument("--output", type=str, default="ml/models/hazard_yolov8.pt", help="Target model path")
    args = parser.parse_args()

    train_hazard_model(
        data_yaml=args.data,
        base_model=args.base,
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        output_weights_path=args.output
    )
