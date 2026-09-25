import cv2

img = cv2.imread('ml/debug_crops/scooter_r_f0.jpg')
h, w = img.shape[:2]

vis = img.copy()
for x in range(0, w, 25):
    cv2.line(vis, (x, 0), (x, h), (0, 255, 0), 1)
    cv2.putText(vis, str(x), (x, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

for y in range(0, h, 25):
    cv2.line(vis, (0, y), (w, y), (0, 255, 0), 1)
    cv2.putText(vis, str(y), (5, y+15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

cv2.imwrite('ml/debug_crops/scooter_r_f0_grid.jpg', vis)
print("Saved scooter_r_f0_grid.jpg with coordinate grid.")
