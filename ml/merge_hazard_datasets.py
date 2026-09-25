"""
ml/merge_hazard_datasets.py - Step 2: Reconcile and Merge Hazard Datasets

Merges:
1. Source 1: Kaggle Potholes Detection YOLOv8 (anggadwisunarto)
2. Source 2: CRDDC2022 / RDD2022 India Subset (oracl4 format)
3. Source 3: UrbanSense Extracted Video Test Frames (42 problem cases in TRAIN)

Unified Classes:
- 0: pothole
- 1: crack
"""

import os
import glob
import shutil
import csv
from collections import Counter
from typing import Dict, List, Tuple

# Source Paths
SRC1_BASE = r"C:\Users\Kavipranaav LM\.cache\kagglehub\datasets\anggadwisunarto\potholes-detection-yolov8\versions\3"
SRC2_BASE = r"c:\urbansense-AI\urbansense-AI-main\ml\datasets\rdd2022_india_yolo"
SRC3_IMG_DIR = r"c:\urbansense-AI\urbansense-AI-main\ml\problem_cases\candidate_frames"
SRC3_LBL_DIR = r"c:\urbansense-AI\urbansense-AI-main\ml\problem_cases\draft_labels"

# Target Path
MERGED_DIR = r"c:\urbansense-AI\urbansense-AI-main\ml\datasets\merged_hazard"

def setup_merged_dirs(base_dir: str):
    for split in ["train", "val"]:
        os.makedirs(os.path.join(base_dir, "images", split), exist_ok=True)
        os.makedirs(os.path.join(base_dir, "labels", split), exist_ok=True)

def remap_and_copy_file(
    src_img: str,
    src_lbl: str,
    dst_img_dir: str,
    dst_lbl_dir: str,
    prefix: str,
    class_remap: Dict[int, int],
    source_name: str,
    split: str
) -> Dict:
    basename = os.path.basename(src_img)
    stem, ext = os.path.splitext(basename)
    out_basename = f"{prefix}{stem}{ext}"
    out_lbl_name = f"{prefix}{stem}.txt"
    
    dst_img_path = os.path.join(dst_img_dir, out_basename)
    dst_lbl_path = os.path.join(dst_lbl_dir, out_lbl_name)
    
    # Copy Image
    shutil.copy2(src_img, dst_img_path)
    
    # Read & Remap Label
    original_classes = []
    unified_classes = []
    remapped_lines = []
    
    if os.path.exists(src_lbl):
        with open(src_lbl, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split()
                if not parts:
                    continue
                orig_cid = int(parts[0])
                if orig_cid in class_remap:
                    new_cid = class_remap[orig_cid]
                    original_classes.append(orig_cid)
                    unified_classes.append(new_cid)
                    remapped_lines.append(f"{new_cid} {' '.join(parts[1:])}\n")
                else:
                    raise ValueError(f"Unknown class {orig_cid} in {src_lbl}")
                    
    with open(dst_lbl_path, "w", encoding="utf-8") as f:
        f.writelines(remapped_lines)
        
    return {
        "filename": out_basename,
        "source_dataset": source_name,
        "split": split,
        "original_class_ids": ";".join(str(c) for c in original_classes) if original_classes else "none",
        "unified_class_ids": ";".join(str(c) for c in unified_classes) if unified_classes else "none",
        "box_count": len(remapped_lines)
    }

def main():
    print("=" * 65)
    print(" Step 2: Reconcile and Merge Hazard Datasets")
    print("=" * 65)
    
    if os.path.exists(MERGED_DIR):
        print(f"Cleaning existing merged directory: {MERGED_DIR}...")
        shutil.rmtree(MERGED_DIR)
        
    setup_merged_dirs(MERGED_DIR)
    manifest_rows = []
    
    # -------------------------------------------------------------
    # Source 1: Kaggle Potholes Detection YOLOv8 (anggadwisunarto)
    # Remap: 0 (pothole) -> 0 (pothole)
    # -------------------------------------------------------------
    src1_map = {0: 0}
    for split, src_sub in [("train", "train"), ("val", "valid")]:
        img_dir = os.path.join(SRC1_BASE, src_sub, "images")
        lbl_dir = os.path.join(SRC1_BASE, src_sub, "labels")
        imgs = sorted(glob.glob(os.path.join(img_dir, "*.jpg")) + glob.glob(os.path.join(img_dir, "*.png")))
        print(f"[Source 1] Processing {split} ({len(imgs)} images)...")
        dst_img_dir = os.path.join(MERGED_DIR, "images", split)
        dst_lbl_dir = os.path.join(MERGED_DIR, "labels", split)
        for img in imgs:
            stem = os.path.splitext(os.path.basename(img))[0]
            lbl = os.path.join(lbl_dir, f"{stem}.txt")
            row = remap_and_copy_file(img, lbl, dst_img_dir, dst_lbl_dir, "kg_", src1_map, "kaggle_potholes", split)
            manifest_rows.append(row)
            
    # -------------------------------------------------------------
    # Source 2: RDD2022 India Subset (oracl4 format)
    # Remap: 3 (D40 pothole) -> 0 (pothole)
    #        0, 1, 2 (D00, D10, D20 crack) -> 1 (crack)
    # -------------------------------------------------------------
    src2_map = {
        0: 1,  # D00 -> crack
        1: 1,  # D10 -> crack
        2: 1,  # D20 -> crack
        3: 0,  # D40 -> pothole
    }
    for split in ["train", "val"]:
        img_dir = os.path.join(SRC2_BASE, "images", split)
        lbl_dir = os.path.join(SRC2_BASE, "labels", split)
        imgs = sorted(glob.glob(os.path.join(img_dir, "*.jpg")) + glob.glob(os.path.join(img_dir, "*.png")))
        print(f"[Source 2] Processing {split} ({len(imgs)} images)...")
        dst_img_dir = os.path.join(MERGED_DIR, "images", split)
        dst_lbl_dir = os.path.join(MERGED_DIR, "labels", split)
        for img in imgs:
            stem = os.path.splitext(os.path.basename(img))[0]
            lbl = os.path.join(lbl_dir, f"{stem}.txt")
            row = remap_and_copy_file(img, lbl, dst_img_dir, dst_lbl_dir, "rdd_", src2_map, "rdd2022_india", split)
            manifest_rows.append(row)

    # -------------------------------------------------------------
    # Source 3: UrbanSense Extracted Video Frames (42 problem cases)
    # Placed in TRAIN ONLY!
    # Remap: 0 (pothole) -> 0 (pothole)
    # -------------------------------------------------------------
    src3_map = {0: 0}
    dst_img_dir = os.path.join(MERGED_DIR, "images", "train")
    dst_lbl_dir = os.path.join(MERGED_DIR, "labels", "train")
    src3_imgs = sorted(glob.glob(os.path.join(SRC3_IMG_DIR, "*.jpg")))
    print(f"[Source 3] Processing train only ({len(src3_imgs)} candidate video frames)...")
    for img in src3_imgs:
        stem = os.path.splitext(os.path.basename(img))[0]
        lbl = os.path.join(SRC3_LBL_DIR, f"{stem}.txt")
        row = remap_and_copy_file(img, lbl, dst_img_dir, dst_lbl_dir, "testvid_", src3_map, "urbansense_video_frames", "train")
        manifest_rows.append(row)
        
    # Write Manifest CSV
    manifest_path = os.path.join(MERGED_DIR, "manifest.csv")
    print(f"\nWriting manifest CSV: {manifest_path} ({len(manifest_rows)} entries)...")
    with open(manifest_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "filename", "source_dataset", "split", "original_class_ids", "unified_class_ids", "box_count"
        ])
        writer.writeheader()
        writer.writerows(manifest_rows)
        
    # Write data.yaml
    yaml_path = os.path.join(MERGED_DIR, "data.yaml")
    yaml_content = f"""path: {MERGED_DIR.replace(os.sep, '/')}
train: images/train
val: images/val

nc: 2
names: ['pothole', 'crack']
"""
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)
    print(f"Created dataset YAML: {yaml_path}")
    
    # -------------------------------------------------------------
    # Compute and Report Merged Statistics
    # -------------------------------------------------------------
    print("\n" + "=" * 65)
    print(" MERGED DATASET AUDIT & STATISTICS")
    print("=" * 65)
    
    for split in ["train", "val"]:
        lbl_dir = os.path.join(MERGED_DIR, "labels", split)
        img_dir = os.path.join(MERGED_DIR, "images", split)
        all_lbls = glob.glob(os.path.join(lbl_dir, "*.txt"))
        all_imgs = glob.glob(os.path.join(img_dir, "*.*"))
        
        box_counts = Counter()
        imgs_with_class = {0: 0, 1: 0}
        empty_imgs = 0
        total_boxes = 0
        
        for lp in all_lbls:
            with open(lp, "r", encoding="utf-8") as f:
                cids = [int(l.split()[0]) for l in f if l.strip()]
            if not cids:
                empty_imgs += 1
            else:
                total_boxes += len(cids)
                unique_cids = set(cids)
                for u in unique_cids:
                    imgs_with_class[u] += 1
                for c in cids:
                    box_counts[c] += 1
                    
        print(f"\n--- Split: {split.upper()} ---")
        print(f"Total Images: {len(all_imgs)}")
        print(f"Total Labels: {len(all_lbls)} (Background without boxes: {empty_imgs})")
        print(f"Total Bounding Boxes: {total_boxes}")
        for cid, cname in [(0, "pothole"), (1, "crack")]:
            cnt = box_counts[cid]
            pct = (cnt / total_boxes * 100) if total_boxes > 0 else 0
            img_cnt = imgs_with_class[cid]
            print(f"  Class {cid} ({cname:7s}): {cnt:6d} boxes ({pct:5.1f}%) across {img_cnt:5d} images")

if __name__ == "__main__":
    main()
