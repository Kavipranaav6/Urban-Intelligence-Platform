import os
import sys
import torch
from ultralytics import YOLO

print(f"CUDA available: {torch.cuda.is_available()}")
device = "cuda" if torch.cuda.is_available() else "cpu"

model = None
try:
    print("Attempting direct YOLO load from 'Babblu2821/alpr-plate-detector'...")
    model = YOLO("Babblu2821/alpr-plate-detector")
    print("Successfully loaded directly!")
except Exception as exc1:
    print(f"Direct load error: {exc1}")
    try:
        from huggingface_hub import hf_hub_download
        print("Attempting hf_hub_download for 'best.pt'...")
        path = hf_hub_download(repo_id="Babblu2821/alpr-plate-detector", filename="best.pt")
        print(f"Downloaded to {path}")
        model = YOLO(path)
        print("Successfully loaded downloaded weights!")
    except Exception as exc2:
        print(f"Huggingface hub download error: {exc2}")

if model is not None:
    print("Model classes:", model.names)
    print("Model test successful.")
