import cv2, os, sys, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from ml.inference.anpr_detector import _get_ocr_reader

reader = _get_ocr_reader()
img = cv2.imread('ml/debug_crops/scooter_r_f0_candidate_rear.jpg')
h, w = img.shape[:2]

# Try multiple enhancements:
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
blurred = cv2.GaussianBlur(gray, (3, 3), 0)
thresh_otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
thresh_adapt = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)

# Sharpening kernel
kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
sharpened = cv2.filter2D(img, -1, kernel)

variants = [
    ("raw", img),
    ("sharpened", sharpened),
    ("clahe", cv2.cvtColor(clahe, cv2.COLOR_GRAY2BGR)),
    ("otsu", cv2.cvtColor(thresh_otsu, cv2.COLOR_GRAY2BGR)),
    ("adaptive", cv2.cvtColor(thresh_adapt, cv2.COLOR_GRAY2BGR))
]

for name, var in variants:
    for scale in [1, 2, 3, 4]:
        var_scaled = cv2.resize(var, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
        res = reader.readtext(var_scaled, detail=1, min_size=3)
        if res:
            print(f"[{name}] scale {scale}: {[(t, round(c*100, 1)) for _, t, c in res]}")
