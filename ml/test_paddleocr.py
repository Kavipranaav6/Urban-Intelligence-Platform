"""
test_paddleocr.py - Validation test for PaddleOCR on sample Indian plate crops
"""
import os
import cv2
import numpy as np
from paddleocr import PaddleOCR

def create_sample_plate_image(text: str, filename: str) -> str:
    """Creates a realistic high-contrast Indian plate image (white background, black text)."""
    h, w = 100, 380
    img = np.ones((h, w, 3), dtype=np.uint8) * 245
    # Border
    cv2.rectangle(img, (4, 4), (w - 5, h - 5), (20, 20, 20), 4)
    # Blue IND strip on left
    cv2.rectangle(img, (6, 6), (42, h - 6), (180, 50, 20), -1)
    cv2.putText(img, "IND", (10, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    # Plate Text
    cv2.putText(img, text, (55, 65), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (10, 10, 10), 3, cv2.LINE_AA)
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    cv2.imwrite(filename, img)
    return filename

def main():
    print("[test_paddleocr] Initializing PaddleOCR (use_angle_cls=False, lang='en')...")
    # use_angle_cls=False is faster and more stable for horizontal plates
    ocr = PaddleOCR(use_angle_cls=False, lang='en')
    
    test_plates = [
        "TN 38 AB 1234",
        "KA 01 MJ 8821",
        "DL 03 C 4912",
        "MH 12 DE 1433"
    ]
    
    results = []
    print("\n--- Running PaddleOCR on Sample Plate Images ---")
    for i, plate_text in enumerate(test_plates, 1):
        sample_path = os.path.join("ml", "scratch", f"sample_plate_{i}.jpg")
        create_sample_plate_image(plate_text, sample_path)
        
        # Run OCR
        ocr_res = ocr.ocr(sample_path, cls=False)
        print(f"\n[Test Plate {i}] Expected: '{plate_text}'")
        extracted_text = ""
        extracted_conf = 0.0
        if ocr_res and len(ocr_res) > 0 and ocr_res[0]:
            for line in ocr_res[0]:
                box, (txt, score) = line
                print(f"   -> Detected: '{txt}' (Confidence: {score:.3f})")
                extracted_text += (" " + txt) if extracted_text else txt
                extracted_conf = max(extracted_conf, score)
        else:
            print("   -> No text detected.")
            
        results.append({
            "expected": plate_text,
            "detected": extracted_text,
            "confidence": extracted_conf
        })

    print("\n--- Summary ---")
    for r in results:
        match = "MATCH" if r['expected'].replace(" ", "") in r['detected'].replace(" ", "") else "PARTIAL/MISMATCH"
        print(f"Expected: {r['expected']:<16} Detected: {r['detected']:<16} Conf: {r['confidence']:.2f} [{match}]")

if __name__ == "__main__":
    main()
