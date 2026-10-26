import cv2, numpy as np, serial

ser = serial.Serial("COM3", 115200, timeout=0)   # change COM3 if yours differs
pitch = roll = 0.0
buf = ""

cap = cv2.VideoCapture(0)
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
detector = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())

while True:
    # read the latest pitch,roll from the ESP32
    buf += ser.read(ser.in_waiting or 1).decode(errors="ignore")
    while "\n" in buf:
        line, buf = buf.split("\n", 1)
        try:
            pitch, roll = map(float, line.strip().split(","))
        except ValueError:
            pass

    ok, frame = cap.read()
    if not ok:
        break

    corners, ids, _ = detector.detectMarkers(frame)
    if ids is not None:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        p = corners[0][0]
        cx, cy = p.mean(axis=0)
        dx, dy = p[1] - p[0]
        yaw = np.degrees(np.arctan2(dy, dx))
        cv2.putText(frame, f"x={cx:.0f} y={cy:.0f} yaw={yaw:.0f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

    cv2.putText(frame, f"pitch={pitch:.1f} roll={roll:.1f}", (10, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 200, 0), 2)
    cv2.imshow("Echo Sense", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
ser.close()
cv2.destroyAllWindows()