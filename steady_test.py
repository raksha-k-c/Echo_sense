import cv2, numpy as np, time

cap = cv2.VideoCapture(0)
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
det = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())

seen = {}
frames = 0
start = time.time()

while time.time() - start < 10:
    ok, frame = cap.read()
    if not ok:
        break
    frames += 1
    corners, ids, _ = det.detectMarkers(frame)
    if ids is not None:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        for c, i in zip(corners, ids.flatten()):
            seen.setdefault(int(i), []).append(c[0].mean(axis=0))
    cv2.putText(frame, f"Hold still... {10 - int(time.time() - start)}s", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    cv2.imshow("Steady test", frame)
    cv2.waitKey(1)

cap.release()
cv2.destroyAllWindows()

for i, pts in seen.items():
    pts = np.array(pts)
    print(f"Marker {i}: seen in {len(pts) / frames * 100:.0f}% of frames, wobble = {pts.std(axis=0).max():.1f} pixels")
if not seen:
    print("No marker seen at all - check light, size and that it faces the camera")