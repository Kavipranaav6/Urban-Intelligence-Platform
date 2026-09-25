"""
ml/prepare_rdd2022_india.py - Converts RDD2022 India subset from PascalVOC XML to YOLOv8 format.
Implements the exact logic from oracl4/RoadDamageDetection's 0_PrepareDatasetYOLOv8.ipynb notebook.
"""

import os
import glob
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from tqdm import tqdm

CLASS_MAPPING = {
    "D00": 0,  # Longitudinal Crack
    "D10": 1,  # Transverse Crack
    "D20": 2,  # Alligator Crack
    "D40": 3,  # Potholes
    "D01": 4,
    "D11": 5,
    "D43": 6,
    "D44": 7,
    "D50": 8,
}

def convert_pascal_to_yolo(xml_file: str, output_txt_file: str, max_class_id: int = 3):
    """
    Converts PascalVOC XML to YOLOv8 annotation format.
    Filters to classes with class_id <= max_class_id (D00..D40 by default, 0..3).
    """
    tree = ET.parse(xml_file)
    root = tree.getroot()
    
    size_elem = root.find("size")
    if size_elem is None:
        return 0
    img_w = int(size_elem.find("width").text)
    img_h = int(size_elem.find("height").text)
    if img_w <= 0 or img_h <= 0:
        return 0

    lines = []
    for obj in root.findall("object"):
        name = obj.find("name").text
        # Handle small typos in dataset if any (e.g. D0w0)
        name = name.strip()
        if name == "D0w0":
            name = "D00"
        
        cls_id = CLASS_MAPPING.get(name, 10)
        if cls_id <= max_class_id:
            bnd = obj.find("bndbox")
            xmin = float(bnd.find("xmin").text)
            ymin = float(bnd.find("ymin").text)
            xmax = float(bnd.find("xmax").text)
            ymax = float(bnd.find("ymax").text)
            
            # Clip
            xmin = max(0.0, min(float(img_w), xmin))
            xmax = max(0.0, min(float(img_w), xmax))
            ymin = max(0.0, min(float(img_h), ymin))
            ymax = max(0.0, min(float(img_h), ymax))
            
            w = xmax - xmin
            h = ymax - ymin
            if w <= 0 or h <= 0:
                continue
            cx = xmin + (w / 2.0)
            cy = ymin + (h / 2.0)
            
            # Normalize to 4 decimal places as in notebook
            norm_cx = round(cx / img_w, 4)
            norm_cy = round(cy / img_h, 4)
            norm_w = round(w / img_w, 4)
            norm_h = round(h / img_h, 4)
            
            lines.append(f"{cls_id} {norm_cx} {norm_cy} {norm_w} {norm_h}\n")
            
    os.makedirs(os.path.dirname(output_txt_file), exist_ok=True)
    with open(output_txt_file, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    return len(lines)

def process_rdd_india(
    src_india_dir: str,
    output_yolo_dir: str,
    split_ratio: float = 0.9,
    background_percentage: float = 0.1,
    seed: int = 1337
):
    """
    Implements CopyDatasetSplit from 0_PrepareDatasetYOLOv8.ipynb:
    1. Converts XMLs in India/train/annotations/xmls to labels in temporary folder.
    2. Drops background images exceeding background_percentage (10%).
    3. Splits with random.seed(1337) into train (90%) and val (10%).
    """
    random.seed(seed)
    
    xml_dir = os.path.join(src_india_dir, "train", "annotations", "xmls")
    img_dir = os.path.join(src_india_dir, "train", "images")
    temp_label_dir = os.path.join(output_yolo_dir, "_temp_raw_labels")
    
    xml_files = sorted(glob.glob(os.path.join(xml_dir, "*.xml")))
    print(f"[1/3] Converting {len(xml_files)} PascalVOC XMLs to YOLO labels...")
    
    for xf in tqdm(xml_files):
        base_name = os.path.splitext(os.path.basename(xf))[0]
        out_txt = os.path.join(temp_label_dir, f"{base_name}.txt")
        convert_pascal_to_yolo(xf, out_txt)
        
    # Gather pairs
    all_imgs = sorted(glob.glob(os.path.join(img_dir, "*.jpg")) + glob.glob(os.path.join(img_dir, "*.png")))
    print(f"[2/3] Filtering images (keeping 100% annotated + up to {int(background_percentage*100)}% background)...")
    
    max_bg = int(len(all_imgs) * background_percentage)
    bg_counter = 0
    
    valid_img_list = []
    valid_lbl_list = []
    
    for img_path in all_imgs:
        stem = Path(img_path).stem
        lbl_path = os.path.join(temp_label_dir, f"{stem}.txt")
        if os.path.exists(lbl_path):
            with open(lbl_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if content:
                valid_img_list.append(img_path)
                valid_lbl_list.append(lbl_path)
            elif bg_counter < max_bg:
                valid_img_list.append(img_path)
                valid_lbl_list.append(lbl_path)
                bg_counter += 1
                
    dataset_length = len(valid_img_list)
    middle_point = round(split_ratio * dataset_length)
    
    indices = list(range(dataset_length))
    random.shuffle(indices)
    train_indices = indices[:middle_point]
    val_indices = indices[middle_point:]
    
    print(f"Total filtered samples: {dataset_length} (Annotated + {bg_counter} background)")
    print(f"Split: Train={len(train_indices)}, Val={len(val_indices)}")
    
    # Copy/Link to final YOLO structure
    print("[3/3] Copying files to train/val directories...")
    train_img_dir = os.path.join(output_yolo_dir, "images", "train")
    val_img_dir = os.path.join(output_yolo_dir, "images", "val")
    train_lbl_dir = os.path.join(output_yolo_dir, "labels", "train")
    val_lbl_dir = os.path.join(output_yolo_dir, "labels", "val")
    
    for d in [train_img_dir, val_img_dir, train_lbl_dir, val_lbl_dir]:
        os.makedirs(d, exist_ok=True)
        
    for i in tqdm(train_indices, desc="Train split"):
        shutil.copy2(valid_img_list[i], train_img_dir)
        shutil.copy2(valid_lbl_list[i], train_lbl_dir)
        
    for i in tqdm(val_indices, desc="Val split"):
        shutil.copy2(valid_img_list[i], val_img_dir)
        shutil.copy2(valid_lbl_list[i], val_lbl_dir)
        
    # Clean up temp
    shutil.rmtree(temp_label_dir, ignore_errors=True)
    print("Conversion and splitting completed successfully!")

if __name__ == "__main__":
    src = r"C:\Users\Kavipranaav LM\.cache\kagglehub\datasets\fadhlannurrachman\rdd2022-india\versions\1\India"
    dest = r"c:\urbansense-AI\urbansense-AI-main\ml\datasets\rdd2022_india_yolo"
    process_rdd_india(src, dest)
