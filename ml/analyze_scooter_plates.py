import os, sys, cv2, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.anpr_detector import _get_ocr_reader
reader = _get_ocr_reader()

files = sorted(glob.glob("ml/debug_crops/scooter_investigate_all/*.jpg"))

for f in files:
    img = cv2.imread(f)
    h, w = img.shape[:2]
    # In this 500x450 region, find any contours that look like a white or yellow plate
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.bilateralFilter(gray, 9, 75, 75)
    edges = cv2.Canny(blur, 50, 200)
    cnts, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for cnt in cnts:
        rx, ry, rw, rh = cv2.boundingRect(cnt)
        if rh > 10 and rw > 20:
            ar = rw / float(rh)
            if 1.2 <= ar <= 5.5 and 20 <= rw <= 250 and 10 <= rh <= 100:
                # Check mean brightness (plates are white or yellow, bright)
                patch = gray[ry:ry+rh, rx:rx+rw]
                if patch.mean() > 100:
                    candidates.append((rx, ry, rw, rh, ar, patch.mean()))
                    
    # Sort candidates by size
    candidates.sort(key=lambda c: c[2]*c[3], reverse=True)
    
    # Run OCR on top 3 candidates
    fname = os.path.basename(f)
    found_any = False
    for rx, ry, rw, rh, ar, mean_b in candidates[:5]:
        patch = img[ry:ry+rh, rx:rx+rw]
        # upscale
        scale = max(2, int(80 / rh))
        patch_up = cv2.resize(patch, (rw*scale, rh*scale), interpolation=cv2.INTER_CUBIC)
        res = reader.readtext(patch_up, detail=1)
        for _, t, c in res:
            if c > 0.15:
                print(f"{fname} [{rx},{ry},{rw},{rh}] AR={ar:.2f}: '{t}' ({c*100:.1f}%)")
                found_any = True
                
    if not found_any:
        # Also run OCR on lower half of scooter
        lower = img[int(h*0.4):, :]
        res2 = reader.readtext(lower, detail=1)
        for _, t, c in res2:
            if c > 0.2:
                print(f"{fname} LOWER: '{t}' ({c*100:.1f}%)")
