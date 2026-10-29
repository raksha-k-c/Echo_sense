import cv2, numpy as np, os

folders = ["liver", "gallbladder", "pancreas", "spleen", "kidney", "pelvis", "ovaries"]
for name in folders:
    path = f"data/{name}"
    os.makedirs(path, exist_ok=True)
    if os.listdir(path):          # don't touch folders that already have images
        continue
    for i in range(1, 21):
        img = np.full((480, 640, 3), (20 + i * 10, 40, 80), np.uint8)
        cv2.putText(img, f"{name.upper()} {i}/20", (40, 250),
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 4)
        cv2.imwrite(f"{path}/{i:02d}.png", img)