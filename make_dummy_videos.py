import cv2, numpy as np, os

os.makedirs("videos", exist_ok=True)
colors = [(80, 40, 40), (40, 80, 40), (40, 40, 80), (80, 80, 40), (80, 40, 80)]

for n in range(5):
    out = cv2.VideoWriter(f"videos/zone{n+1}.mp4", cv2.VideoWriter_fourcc(*"mp4v"), 30, (640, 480))
    for f in range(150):
        img = np.full((480, 640, 3), colors[n], np.uint8)
        cv2.circle(img, (60 + (f * 4) % 520, 240), 40, (200, 200, 200), -1)
        cv2.putText(img, f"DUMMY VIDEO {n+1}  frame {f}", (30, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        out.write(img)
    out.release()