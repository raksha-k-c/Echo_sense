import cv2, numpy as np, serial, time, glob, os

# ---------------- SETTINGS ----------------
SERIAL_PORT = "COM3"
CAMERA_INDEX = 0
MARKER_IDS = None        # None = any marker; use (23, 24) once printed
MIN_AREA = 800           # ignore markers smaller than this (pixels); lower if yours is skipped

CONTACT_ON = 300         # press harder than this to show the image
CONTACT_OFF = 180        # image stays until force falls below this
DEADBAND_PX = 3          # position changes smaller than this are ignored
STEP_MARGIN = 0.8        # how far (in image steps) you must move before the image changes
ZONE_MARGIN = 0.02       # extra room before leaving the current organ zone
TILT_DEADBAND = 2.0      # degrees of tilt ignored

# (organ, x1, y1, x2, y2, image folder); positions are fractions of the camera picture
ZONES = [
    ("Liver",        0.00, 0.0, 0.25, 0.5, "data/liver"),
    ("Gallbladder",  0.25, 0.0, 0.50, 0.5, "data/gallbladder"),
    ("Pancreas",     0.50, 0.0, 0.75, 0.5, "data/pancreas"),
    ("Spleen",       0.75, 0.0, 1.00, 0.5, "data/spleen"),
    ("Right kidney", 0.00, 0.5, 0.25, 1.0, "data/kidney"),
    ("Pelvis",       0.25, 0.5, 0.50, 1.0, "data/pelvis"),
    ("Ovaries",      0.50, 0.5, 0.75, 1.0, "data/ovaries"),
    ("Left kidney",  0.75, 0.5, 1.00, 1.0, "data/kidney"),
]
CREDITS = ["Images: open datasets (CC BY 4.0)", "Karim 2025, MSU Scholars Junction"]
# ------------------------------------------

try:
    ser = serial.Serial(SERIAL_PORT, 115200, timeout=0)
except Exception:
    ser = None
    print("ESP32 not found - running without tilt and pressure")


def list_images(folder):
    files = []
    for ext in ("*.png", "*.jpg", "*.jpeg", "*.bmp"):
        files += glob.glob(os.path.join(folder, ext))
    return sorted(files)


zone_files = [list_images(z[5]) for z in ZONES]
cache = {}


def load(path):
    if path not in cache:
        if len(cache) > 200:
            cache.clear()
        cache[path] = cv2.imread(path)
    return cache[path]


def fit(img, W=640, H=480):
    h, w = img.shape[:2]
    s = min(W / w, H / h)
    r = cv2.resize(img, (max(1, int(w * s)), max(1, int(h * s))))
    canvas = np.zeros((H, W, 3), np.uint8)
    y0, x0 = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2
    canvas[y0:y0 + r.shape[0], x0:x0 + r.shape[1]] = r
    return canvas


def apply_tgc(img, gain, tgc):
    h = img.shape[0]
    ramp = np.linspace(1.0, 1.0 + tgc, h).reshape(h, 1, 1)   # deeper rows get more gain
    return np.clip(img.astype(np.float32) * gain * ramp, 0, 255).astype(np.uint8)


def dz(v, d):
    """ignore small values, keep the part beyond the dead zone"""
    return 0.0 if abs(v) < d else v - np.sign(v) * d


def apply_tilt(img, p, r):
    h, w = img.shape[:2]
    dx = int(np.clip(dz(r, TILT_DEADBAND), -30, 30) / 30 * 40)
    dy = int(np.clip(dz(p, TILT_DEADBAND), -30, 30) / 30 * 40)
    return cv2.warpAffine(img, np.float32([[1, 0, dx], [0, 1, dy]]), (w, h))


def find_zone(fx, fy, current):
    if current is not None:
        _, x1, y1, x2, y2, _ = ZONES[current]
        m = ZONE_MARGIN
        if x1 - m <= fx < x2 + m and y1 - m <= fy < y2 + m:
            return current                     # stay in the zone until clearly outside
    for i, (_, x1, y1, x2, y2, _) in enumerate(ZONES):
        if x1 <= fx < x2 and y1 <= fy < y2:
            return i
    return None


def pick_index(frac, n, k):
    target = float(np.clip(frac, 0, 1)) * (n - 1)
    if k is None or k >= n or abs(target - k) > STEP_MARGIN:
        return int(round(target))
    return k                                   # not moved enough: keep the same image


cap = cv2.VideoCapture(CAMERA_INDEX)
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
detector = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())

pitch = roll = pitch0 = roll0 = force = yaw = 0.0
gain, tgc = 1.0, 0.0
buf = ""
smooth = None
last_seen = 0.0
touching = False
cur_zone = None
cur_k = None

while True:
    # tilt and pressure from the ESP32
    if ser:
        buf += ser.read(ser.in_waiting or 1).decode(errors="ignore")
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            try:
                pitch, roll, force = map(float, line.strip().split(","))
            except ValueError:
                pass

    ok, frame = cap.read()
    if not ok:
        break
    h, w = frame.shape[:2]

    # find the marker (ignore tiny false detections)
    corners, ids, _ = detector.detectMarkers(frame)
    if ids is not None:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        good = [c[0] for c, i in zip(corners, ids.flatten())
                if (MARKER_IDS is None or int(i) in MARKER_IDS)
                and cv2.contourArea(c[0]) > MIN_AREA]
        if good:
            cx, cy = np.mean([g.mean(axis=0) for g in good], axis=0)
            dx, dy = good[0][1] - good[0][0]
            yaw = float(np.degrees(np.arctan2(dy, dx)))
            if smooth is None:
                smooth = (cx, cy)
            elif np.hypot(cx - smooth[0], cy - smooth[1]) > DEADBAND_PX:
                smooth = (0.7 * smooth[0] + 0.3 * cx, 0.7 * smooth[1] + 0.3 * cy)
            last_seen = time.time()

    seen = smooth is not None and time.time() - last_seen < 0.5
    fx = smooth[0] / w if seen else 0.0
    fy = smooth[1] / h if seen else 0.0

    # organ zone, with a little stickiness
    new_zone = find_zone(fx, fy, cur_zone) if seen else None
    if new_zone != cur_zone:
        cur_k = None
    cur_zone = new_zone
    active = None
    if cur_zone is not None:
        _, x1, y1, x2, y2, _ = ZONES[cur_zone]
        active = (cur_zone, (fx - x1) / (x2 - x1))

    # contact with separate on and off levels
    touching = (force > CONTACT_OFF) if touching else (force > CONTACT_ON)

    # camera window
    for i, (name, x1, y1, x2, y2, _) in enumerate(ZONES):
        color = (0, 255, 0) if active and active[0] == i else (120, 120, 120)
        cv2.rectangle(frame, (int(x1 * w), int(y1 * h)), (int(x2 * w), int(y2 * h)), color, 2)
        cv2.putText(frame, name, (int(x1 * w) + 8, int(y1 * h) + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    if seen:
        cv2.putText(frame, f"x={fx:.2f} y={fy:.2f}", (10, h - 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    cv2.putText(frame, f"pitch={pitch - pitch0:.1f} roll={roll - roll0:.1f} force={force:.0f}",
                (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 0), 2)
    cv2.imshow("Camera (tracking)", frame)

    # ultrasound screen
    view = np.zeros((480, 640, 3), np.uint8)
    info = []
    msg = "No probe detected"
    if active:
        zi, frac = active
        files = zone_files[zi]
        info.append(f"Region: {ZONES[zi][0]}")
        if not files:
            msg = "No images in " + ZONES[zi][5]
        elif not touching:
            msg = "Press probe on the body"
        else:
            cur_k = pick_index(frac, len(files), cur_k)
            img = load(files[cur_k])
            if img is None:
                msg = "Could not read image"
            else:
                view = apply_tilt(apply_tgc(fit(img), gain, tgc), pitch - pitch0, roll - roll0)
                msg = None
                info.append(f"Image {cur_k + 1} of {len(files)}")
    if msg:
        cv2.putText(view, msg, (110, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (150, 150, 150), 2)

    info += [
        "",
        f"Position  x={fx:.2f}  y={fy:.2f}",
        f"Yaw       {yaw:.0f} deg",
        f"Pitch {pitch - pitch0:.1f}   Roll {roll - roll0:.1f}",
        f"Pressure  {force:.0f} " + ("(contact)" if touching else "(no contact)"),
        "",
        f"Gain {gain:.1f}    TGC {tgc:+.1f}",
        "[ ] gain   , . TGC",
        "z zero tilt   q quit",
    ]
    panel = np.full((480, 300, 3), 30, np.uint8)
    for n, text in enumerate(info):
        cv2.putText(panel, text, (12, 35 + n * 28), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (230, 230, 230), 1, cv2.LINE_AA)
    for n, text in enumerate(CREDITS):
        cv2.putText(panel, text, (12, 440 + n * 20), cv2.FONT_HERSHEY_SIMPLEX,
                    0.4, (150, 150, 150), 1, cv2.LINE_AA)
    cv2.imshow("EchoSense", np.hstack([view, panel]))

    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break
    if key == ord("z"):
        pitch0, roll0 = pitch, roll
    if key == ord("["):
        gain = max(0.4, gain - 0.1)
    if key == ord("]"):
        gain = min(2.5, gain + 0.1)
    if key == ord(","):
        tgc = max(-0.5, tgc - 0.1)
    if key == ord("."):
        tgc = min(2.0, tgc + 0.1)

cap.release()
if ser:
    ser.close()
cv2.destroyAllWindows()