import cv2, numpy as np, serial, time, csv, os

# ---------------- SETTINGS ----------------
SERIAL_PORT = "COM3"
CAMERA_INDEX = 0
CONTACT = 300            # pressure needed before the image appears
MARKER_IDS = None        # None = any marker; use (23, 24) once printed

# (label, x1, y1, x2, y2, organ in dataset/tags.csv); positions are fractions of the camera picture
ZONES = [
    ("Liver",        0.00, 0.0, 0.30, 0.5, "Liver"),
    ("Gallbladder",  0.30, 0.0, 0.50, 0.5, "Gallbladder"),
    ("Pancreas",     0.50, 0.0, 0.70, 0.5, "Pancreas"),
    ("Spleen",       0.70, 0.0, 1.00, 0.5, "Spleen"),
    ("Right kidney", 0.00, 0.5, 0.30, 1.0, "Kidney"),
    ("Pelvis",       0.30, 0.5, 0.50, 1.0, "Pelvis"),
    ("Ovaries",      0.50, 0.5, 0.70, 1.0, "Ovaries"),
    ("Left kidney",  0.70, 0.5, 1.00, 1.0, "Kidney"),
]
TAGS = "dataset/tags.csv"   # made by build_dataset.py: organ, file, sweep, pitch, roll
LOG = "session_log.csv"     # press l to start/stop logging
CREDITS = ["Images: open datasets (CC BY 4.0)", "Karim 2025, MSU Scholars Junction"]
# ------------------------------------------

try:
    ser = serial.Serial(SERIAL_PORT, 115200, timeout=0)
except Exception:
    ser = None
    print("ESP32 not found - running without tilt and pressure")


def load_tags():
    tags = {}
    if os.path.exists(TAGS):
        with open(TAGS) as fh:
            for r in csv.DictReader(fh):
                tags.setdefault(r["organ"], []).append(
                    (os.path.join("dataset", r["file"]), float(r["sweep"]), float(r["pitch"]), float(r["roll"])))
    return tags


def match(entries, sweep, pitch, roll):
    """Nearest tagged image to the probe pose (sweep position, pitch, roll)."""
    return min(range(len(entries)), key=lambda k: (entries[k][1] - sweep) ** 2
               + ((entries[k][2] - pitch) / 30) ** 2 + ((entries[k][3] - roll) / 30) ** 2)


tags = load_tags()
zone_files = [tags.get(z[5], []) for z in ZONES]
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


def apply_tilt(img, p, r):
    h, w = img.shape[:2]
    dx = int(np.clip(r, -30, 30) / 30 * 40)
    dy = int(np.clip(p, -30, 30) / 30 * 40)
    return cv2.warpAffine(img, np.float32([[1, 0, dx], [0, 1, dy]]), (w, h))


cap = cv2.VideoCapture(CAMERA_INDEX)
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
detector = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())

pitch = roll = pitch0 = roll0 = force = yaw = 0.0
gain, tgc = 1.0, 0.0
buf = ""
smooth = None
last_seen = 0.0
logf = logw = None
shown_name = ""

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

    # find the marker
    corners, ids, _ = detector.detectMarkers(frame)
    if ids is not None:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        good = [c[0] for c, i in zip(corners, ids.flatten())
                if MARKER_IDS is None or int(i) in MARKER_IDS]
        if good:
            cx, cy = np.mean([g.mean(axis=0) for g in good], axis=0)
            dx, dy = good[0][1] - good[0][0]
            yaw = float(np.degrees(np.arctan2(dy, dx)))
            smooth = (cx, cy) if smooth is None else (0.6 * smooth[0] + 0.4 * cx, 0.6 * smooth[1] + 0.4 * cy)
            last_seen = time.time()

    seen = smooth is not None and time.time() - last_seen < 0.5
    fx = smooth[0] / w if seen else 0.0
    fy = smooth[1] / h if seen else 0.0

    active = None
    if seen:
        for i, (name, x1, y1, x2, y2, _) in enumerate(ZONES):
            if x1 <= fx < x2 and y1 <= fy < y2:
                active = (i, (fx - x1) / (x2 - x1))

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
    touching = force > CONTACT
    view = np.zeros((480, 640, 3), np.uint8)
    info = []
    msg = "No probe detected"
    if active:
        zi, frac = active
        files = zone_files[zi]
        info.append(f"Region: {ZONES[zi][0]}")
        if not files:
            msg = "No tagged images: run build_dataset.py"
        elif not touching:
            msg = "Press probe on the body"
        else:
            k = match(files, frac, pitch - pitch0, roll - roll0)
            img = load(files[k][0])
            if img is None:
                msg = "Could not read image"
            else:
                view = apply_tilt(apply_tgc(fit(img), gain, tgc), pitch - pitch0, roll - roll0)
                msg = None
                info.append(f"Image {k + 1} of {len(files)}")
                shown_name = files[k][0]
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
        "l log " + ("ON" if logf else "off"),
    ]
    panel = np.full((480, 300, 3), 30, np.uint8)
    for n, text in enumerate(info):
        cv2.putText(panel, text, (12, 35 + n * 28), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (230, 230, 230), 1, cv2.LINE_AA)
    for n, text in enumerate(CREDITS):
        cv2.putText(panel, text, (12, 440 + n * 20), cv2.FONT_HERSHEY_SIMPLEX,
                    0.4, (150, 150, 150), 1, cv2.LINE_AA)
    cv2.imshow("EchoSense", np.hstack([view, panel]))

    if logw:
        logw.writerow([f"{time.time():.3f}", int(seen), f"{fx:.3f}", f"{fy:.3f}", f"{yaw:.1f}",
                       f"{pitch - pitch0:.1f}", f"{roll - roll0:.1f}", f"{force:.0f}", int(touching),
                       ZONES[active[0]][0] if active else "", shown_name if (active and touching) else ""])

    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break
    if key == ord("l"):
        if logf:
            logf.close()
            logf = logw = None
        else:
            logf = open(LOG, "a", newline="")
            logw = csv.writer(logf)
            if logf.tell() == 0:
                logw.writerow(["t", "tracked", "x", "y", "yaw", "pitch", "roll", "force", "contact", "zone", "image"])
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

if logf:
    logf.close()
cap.release()
if ser:
    ser.close()
cv2.destroyAllWindows()