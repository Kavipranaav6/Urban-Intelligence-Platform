"""
ml/train_hazard_merged.py - Fine-tunes YOLOv8n on Unified Road Hazard Merged Dataset

UrbanSense AI: Mobile Urban Intelligence Platform
Step 3: Fine-tunes starting from existing ml/models/hazard_yolov8.pt (real weights)
Target dataset: ml/datasets/merged_hazard/data.yaml
Classes (2):
  0: pothole
  1: crack
"""

import os
import sys
import time
import argparse
import torch
from ultralytics import YOLO

def train_merged_hazard(
    data_yaml: str = "ml/datasets/merged_hazard/data.yaml",
    base_model: str = "ml/models/hazard_yolov8.pt",
    epochs: int = 50,
    batch: int = 16,
    imgsz: int = 640,
    patience: int = 10,
    workers: int = 4,
    project: str = "ml/runs",
    name: str = "hazard_merged_finetune",
    device: str = "cpu"
):
    start_time = time.time()
    
    print("=" * 65)
    print(" UrbanSense AI - Merged Hazard YOLOv8n Training (Step 3)")
    print("=" * 65)
    
    # Check base model
    if os.path.exists(base_model):
        print(f"[Model Check] Starting from EXISTING trained weights: {base_model} ({os.path.getsize(base_model):,} bytes)")
    else:
        print(f"[Model Check] Existing {base_model} not found; falling back to COCO pretrained yolov8n.pt")
        base_model = "yolov8n.pt"
        
    if not os.path.exists(data_yaml):
        raise FileNotFoundError(f"Dataset YAML configuration '{data_yaml}' does not exist.")

    print(f"Base Model        : {base_model}")
    print(f"Dataset YAML      : {data_yaml}")
    print(f"Target Epochs     : {epochs}")
    print(f"Early Stop (pat)  : {patience}")
    print(f"Batch Size        : {batch}")
    print(f"Image Size (imgsz): {imgsz}")
    print(f"Device            : {device}")
    print(f"CPU Workers       : {workers}")
    print(f"Run Output Folder : {os.path.join(project, name)}")
    print("=" * 65)

    # 1. Load base model
    print(f"\n[1/3] Initializing model from {base_model}...")
    model = YOLO(base_model)
    
    # 2. Train with full augmentations (mosaic=1.0, mixup, etc.)
    print(f"\n[2/3] Starting fine-tuning run...")
    try:
        results = model.train(
            data=data_yaml,
            epochs=epochs,
            patience=patience,
            batch=batch,
            imgsz=imgsz,
            device=device,
            workers=workers,
            pretrained=True,
            save=True,
            plots=True,
            project=project,
            name=name,
            exist_ok=True,
            verbose=True
        )
    except RuntimeError as e:
        if "out of memory" in str(e).lower() or "memory" in str(e).lower():
            print(f"\n[Memory Warning] Encountered memory issue with batch={batch}. Retrying with batch={batch // 2}...")
            batch = max(4, batch // 2)
            results = model.train(
                data=data_yaml,
                epochs=epochs,
                patience=patience,
                batch=batch,
                imgsz=imgsz,
                device=device,
                workers=max(2, workers // 2),
                pretrained=True,
                save=True,
                plots=True,
                project=project,
                name=name,
                exist_ok=True,
                verbose=True
            )
        else:
            raise e

    elapsed_sec = time.time() - start_time
    hours, rem = divmod(elapsed_sec, 3600)
    minutes, seconds = divmod(rem, 60)
    time_str = f"{int(hours)}h {int(minutes)}m {seconds:.1f}s"
    
    # 3. Final Evaluation & Detailed Per-Class Metrics Extraction
    print(f"\n[3/3] Evaluating validation metrics on best checkpoint...")
    best_pt = os.path.join(project, name, "weights", "best.pt")
    if not os.path.exists(best_pt):
        best_pt = os.path.join(project, name, "weights", "last.pt")
        
    eval_model = YOLO(best_pt)
    metrics = eval_model.val(data=data_yaml, imgsz=imgsz, device=device, split="val", verbose=True)

    # Overall metrics
    overall_map50 = float(metrics.box.map50)
    overall_map50_95 = float(metrics.box.map)
    overall_precision = float(metrics.box.mp)
    overall_recall = float(metrics.box.mr)

    # Per-class metrics
    # metrics.box.maps is per-class mAP50-95
    # metrics.box.all_ap[:, 0] is per-class mAP50 (first IoU threshold 0.50)
    class_names = metrics.names
    num_classes = len(class_names)
    
    # Precision and recall per class
    # metrics.box.p and metrics.box.r contain per class array or list
    p_per_class = metrics.box.p.tolist() if hasattr(metrics.box.p, "tolist") else list(metrics.box.p)
    r_per_class = metrics.box.r.tolist() if hasattr(metrics.box.r, "tolist") else list(metrics.box.r)
    
    # mAP50 per class: all_ap is [num_classes, 10] where index 0 is IoU=0.50
    map50_per_class = []
    if hasattr(metrics.box, "all_ap") and metrics.box.all_ap is not None:
        all_ap = metrics.box.all_ap
        for cid in range(num_classes):
            map50_per_class.append(float(all_ap[cid][0]))
    else:
        map50_per_class = [float(x) for x in metrics.box.ap50] if hasattr(metrics.box, "ap50") else [overall_map50] * num_classes

    print("\n" + "=" * 65)
    print(" STEP 3 TRAINING COMPLETE — FINAL VALIDATION REPORT")
    print("=" * 65)
    print(f"Total Elapsed Time : {time_str} ({elapsed_sec:.1f}s)")
    if torch.cuda.is_available():
        vram_mb = torch.cuda.max_memory_allocated() / (1024 ** 2)
        print(f"Peak GPU VRAM Usage: {vram_mb:.1f} MB")
    print(f"Saved Checkpoint   : {best_pt} ({os.path.getsize(best_pt):,} bytes)")
    print("-" * 65)
    print(f"Overall mAP50      : {overall_map50:.4f} ({overall_map50 * 100:.1f}%)")
    print(f"Overall mAP50-95   : {overall_map50_95:.4f} ({overall_map50_95 * 100:.1f}%)")
    print(f"Overall Precision  : {overall_precision:.4f} ({overall_precision * 100:.1f}%)")
    print(f"Overall Recall     : {overall_recall:.4f} ({overall_recall * 100:.1f}%)")
    print("-" * 65)
    print("Per-Class Metrics:")
    for cid in range(num_classes):
        cname = class_names.get(cid, str(cid))
        p_val = p_per_class[cid] if cid < len(p_per_class) else 0.0
        r_val = r_per_class[cid] if cid < len(r_per_class) else 0.0
        m50_val = map50_per_class[cid] if cid < len(map50_per_class) else 0.0
        print(f"  Class {cid} ({cname:10s}) -> mAP50: {m50_val*100:5.1f}% | Precision: {p_val*100:5.1f}% | Recall: {r_val*100:5.1f}%")

    if num_classes >= 2:
        pothole_r = r_per_class[0] if len(r_per_class) > 0 else 0.0
        crack_r = r_per_class[1] if len(r_per_class) > 1 else 0.0
        recall_gap = (pothole_r - crack_r) * 100
        print("-" * 65)
        print(f"Recall Gap (Pothole Recall - Crack Recall): {recall_gap:+.1f}%")
        if recall_gap > 15.0:
            print("[FLAG] Crack recall is more than 15% lower than pothole recall! Consider class-weighted loss in follow-up.")
        else:
            print("[OK] Crack recall is balanced with pothole recall (gap <= 15%).")
    print("=" * 65)
    
    return {
        "best_pt": best_pt,
        "elapsed_sec": elapsed_sec,
        "time_str": time_str,
        "overall_map50": overall_map50,
        "overall_map50_95": overall_map50_95,
        "precision": p_per_class,
        "recall": r_per_class,
        "map50": map50_per_class
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train / Fine-tune YOLOv8 on Merged Hazard Dataset")
    parser.add_argument("--data", default="ml/datasets/merged_hazard/data.yaml")
    parser.add_argument("--base", default="ml/models/hazard_yolov8.pt")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--device", default="0" if os.environ.get("CUDA_VISIBLE_DEVICES") != "" else "0")
    args = parser.parse_args()

    train_merged_hazard(
        data_yaml=args.data,
        base_model=args.base,
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        patience=args.patience,
        workers=args.workers,
        device=args.device
    )

