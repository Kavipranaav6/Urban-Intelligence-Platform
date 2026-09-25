import os, sys, cv2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

cap = cv2.VideoCapture('videos/driving.mp4')
out = 'ml/debug_crops/scooter_investigate_all'
os.makedirs(out, exist_ok=True)

for fi in range(48, 68):
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ret, frame = cap.read()
    if not ret: continue
    
    # In frame fi, let's crop the right scooter (x: 1000..1500, y: 400..850)
    scooter_crop = frame[400:850, 1000:1500]
    cv2.imwrite(f"{out}/f{fi:03d}_scooter.jpg", scooter_crop)

cap.release()
print("Saved scooter frames 48-67.")
