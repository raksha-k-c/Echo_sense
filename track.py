import cv2, numpy as np

cap = cv2.VideoCapture(0)          # try 1 if the wrong camera opens
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
detector = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())

while True:
    ok, frame = cap.read()
    if not ok:
        break
    corners, ids, _ = detector.detectMarkers(frame)
    if ids is not None:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        for c, i in zip(corners, ids.flatten()):
            p = c[0]
            cx, cy = p.mean(axis=0)
            dx, dy = p[1] - p[0]
            yaw = np.degrees(np.arctan2(dy, dx))
            txt = f"ID {i}  x={cx:.0f} y={cy:.0f} yaw={yaw:.0f}"
            cv2.putText(frame, txt, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    cv2.imshow("Echo Sense tracking", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()