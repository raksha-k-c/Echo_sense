import cv2, numpy as np, serial, time, csv, os, threading, requests

# ---------------- SETTINGS ----------------
SERIAL_PORT = "COM3"
CAMERA_SOURCE = "http://10.145.79.45/stream"   # ESP32-CAM address. Use 0 for the laptop webcam.
CONTACT = 300            # pressure needed before the image appears
TOO_HARD = 2500          # above this: beep + warning (same value as in the ESP32 code)
MARKER_IDS = None        # None = any marker; use (23, 24) once printed
VIEW_W = 800             # width of the camera window picture

# --- stability (raise a number = steadier image, slower to react) ---
POSE_DEADBAND = 3.0      # degrees of tilt change ignored (stops wobble)
POS_DEADBAND = 0.03      # sweep position change ignored (fraction of the zone)
IMG_SWITCH_MARGIN = 0.75 # new image must be this much better than the current one to switch
ZONE_CONFIRM = 5         # frames in a new zone before switching to it
HOLD_AFTER_LOSS = 1.0    # seconds to keep the image after the marker is lost

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


class MjpegCapture:
    """Reads the ESP32-CAM MJPEG stream without OpenCV's ffmpeg."""
    def __init__(self, url):
        self.url, self.frame, self.run = url, None, True
        self.new = threading.Event()
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while self.run:
            try:
                buf = b""
                r = requests.get(self.url, stream=True, timeout=5)
                for chunk in r.iter_content(4096):
                    if not self.run:
                        break
                    buf += chunk
                    a, b = buf.find(b"\xff\xd8"), buf.find(b"\xff\xd9")
                    if a != -1 and b != -1 and b > a:
                        img = cv2.imdecode(np.frombuffer(buf[a:b + 2], np.uint8), cv2.IMREAD_COLOR)
                        buf = buf[b + 2:]
                        if img is not None:
                            self.frame = img
                            self.new.set()
            except Exception as e:
                print("Camera stream problem, retrying:", e)
                time.sleep(1)

    def isOpened(self):
        return True

    def read(self):
        if not self.new.wait(5):
            return (self.frame is not None), (None if self.frame is None else self.frame.copy())
        self.new.clear()
        return True, self.frame.copy()

    def release(self):
        self.run = False


last_beep = 0.0
def beep():
    def _b():
        try:
            import winsound
            winsound.Beep(1800, 150)
        except Exception:
            pass
    threading.Thread(target=_b, daemon=True).start()


def load_tags():
    tags = {}
    if os.path.exists(TAGS):
        with open(TAGS) as fh:
            for r in csv.DictReader(fh):
                tags.setdefault(r["organ"], []).append(
                    (os.path.join("dataset", r["file"]), float(r["sweep"]), float(r["pitch"]), float(r["roll"])))
    return tags


def dist(e, sweep, pitch, roll):
    return (e[1] - sweep) ** 2 + ((e[2] - pitch) / 30) ** 2 + ((e[3] - roll) / 30) ** 2


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


def zone_at(fx, fy):
    for i, (_, x1, y1, x2, y2, _) in enumerate(ZONES):
        if x1 <= fx < x2 and y1 <= fy < y2:
            return i
    return None


cap = MjpegCapture(CAMERA_SOURCE) if isinstance(CAMERA_SOURCE, str) else cv2.VideoCapture(CAMERA_SOURCE)
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
detector = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters())

cv2.namedWindow("Camera (tracking)", cv2.WINDOW_NORMAL)
cv2.namedWindow("EchoSense", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Camera (tracking)", VIEW_W, int(VIEW_W * 0.75))
cv2.resizeWindow("EchoSense", 940, 480)

pitch = roll = force = yaw = 0.0
fpitch = froll = 0.0            # filtered tilt (absolute)
pitch0 = roll0 = 0.0
gain, tgc = 1.0, 0.0
buf = ""
smooth = None
last_seen = 0.0
logf = logw = None
shown_name = ""

cur_zone = None
cand_count = 0
s_frac = 0.5                    # stable sweep position inside the zone
s_pitch = s_roll = 0.0          # stable tilt (relative to zero)
cur_k = None                    # image currently shown
touching = False
frozen = False

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
    fpitch += 0.25 * (pitch - fpitch)
    froll += 0.25 * (roll - froll)

    ok, frame = cap.read()
    if not ok:
        break
    oh, ow = frame.shape[:2]
    frame = cv2.resize(frame, (VIEW_W, int(oh * VIEW_W / ow)), interpolation=cv2.INTER_CUBIC)
    h, w = frame.shape[:2]

    if force > TOO_HARD and time.time() - last_beep > 0.4:
        beep(); last_beep = time.time()

    # contact with a little hysteresis so it doesn't flicker
    if force > CONTACT:
        touching = True
    elif force < CONTACT * 0.7:
        touching = False

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
            smooth = (cx, cy) if smooth is None else (0.7 * smooth[0] + 0.3 * cx, 0.7 * smooth[1] + 0.3 * cy)
            last_seen = time.time()

    seen = smooth is not None and time.time() - last_seen < 0.3
    fx = smooth[0] / w if smooth else 0.0
    fy = smooth[1] / h if smooth else 0.0

    if not frozen:
        if seen:
            cand = zone_at(fx, fy)
            if cand is not None:
                if cur_zone is None:
                    cur_zone, cand_count, cur_k = cand, 0, None
                    s_frac = 0.5
                elif cand != cur_zone:
                    cand_count += 1
                    if cand_count >= ZONE_CONFIRM:
                        cur_zone, cand_count, cur_k = cand, 0, None
                else:
                    cand_count = 0
            if cur_zone is not None:
                x1, x2 = ZONES[cur_zone][1], ZONES[cur_zone][3]
                raw_frac = float(np.clip((fx - x1) / (x2 - x1), 0, 1))
                if cur_k is None or abs(raw_frac - s_frac) > POS_DEADBAND:
                    s_frac = raw_frac
        elif time.time() - last_seen > HOLD_AFTER_LOSS:
            cur_zone, cur_k = None, None

        rel_p, rel_r = fpitch - pitch0, froll - roll0
        if abs(rel_p - s_pitch) > POSE_DEADBAND:
            s_pitch = rel_p
        if abs(rel_r - s_roll) > POSE_DEADBAND:
            s_roll = rel_r

    # camera window
    for i, (name, x1, y1, x2, y2, _) in enumerate(ZONES):
        color = (0, 255, 0) if cur_zone == i else (120, 120, 120)
        cv2.rectangle(frame, (int(x1 * w), int(y1 * h)), (int(x2 * w), int(y2 * h)), color, 2)
        cv2.putText(frame, name, (int(x1 * w) + 8, int(y1 * h) + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    if seen:
        cv2.putText(frame, f"x={fx:.2f} y={fy:.2f}", (10, h - 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    cv2.putText(frame, f"pitch={s_pitch:.1f} roll={s_roll:.1f} force={force:.0f}",
                (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 200, 0), 2)
    cv2.imshow("Camera (tracking)", frame)

    # ultrasound screen
    view = np.zeros((480, 640, 3), np.uint8)
    info = []
    msg = "No probe detected"
    if cur_zone is not None:
        files = zone_files[cur_zone]
        info.append(f"Region: {ZONES[cur_zone][0]}")
        if not files:
            msg = "No tagged images: run build_dataset.py"
        elif not touching:
            msg = "Press probe on the body"
        else:
            if not frozen or cur_k is None:
                best = min(range(len(files)), key=lambda k: dist(files[k], s_frac, s_pitch, s_roll))
                if (cur_k is None or cur_k >= len(files) or
                        dist(files[best], s_frac, s_pitch, s_roll) <
                        IMG_SWITCH_MARGIN * dist(files[cur_k], s_frac, s_pitch, s_roll)):
                    cur_k = best
            img = load(files[cur_k][0])
            if img is None:
                msg = "Could not read image"
            else:
                view = apply_tilt(apply_tgc(fit(img), gain, tgc), s_pitch, s_roll)
                msg = None
                info.append(f"Image {cur_k + 1} of {len(files)}")
                shown_name = files[cur_k][0]
    if msg:
        cv2.putText(view, msg, (110, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (150, 150, 150), 2)

    pressure_txt = "TOO HARD!" if force > TOO_HARD else ("(contact)" if touching else "(no contact)")
    info += [
        "",
        f"Position  x={fx:.2f}  y={fy:.2f}",
        f"Yaw       {yaw:.0f} deg",
        f"Pitch {s_pitch:.1f}   Roll {s_roll:.1f}",
        f"Pressure  {force:.0f} " + pressure_txt,
        "",
        f"Gain {gain:.1f}    TGC {tgc:+.1f}",
        "[ ] gain   , . TGC",
        "z zero tilt   q quit",
        "f freeze " + ("ON" if frozen else "off"),
        "l log " + ("ON" if logf else "off"),
    ]
    panel = np.full((480, 300, 3), 30, np.uint8)
    for n, text in enumerate(info):
        col = (80, 80, 255) if "TOO HARD" in text else (230, 230, 230)
        cv2.putText(panel, text, (12, 35 + n * 28), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, col, 1, cv2.LINE_AA)
    for n, text in enumerate(CREDITS):
        cv2.putText(panel, text, (12, 440 + n * 20), cv2.FONT_HERSHEY_SIMPLEX,
                    0.4, (150, 150, 150), 1, cv2.LINE_AA)
    cv2.imshow("EchoSense", np.hstack([view, panel]))

    if logw:
        logw.writerow([f"{time.time():.3f}", int(seen), f"{fx:.3f}", f"{fy:.3f}", f"{yaw:.1f}",
                       f"{s_pitch:.1f}", f"{s_roll:.1f}", f"{force:.0f}", int(touching),
                       ZONES[cur_zone][0] if cur_zone is not None else "",
                       shown_name if (cur_zone is not None and touching) else ""])

    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break
    if key == ord("f"):
        frozen = not frozen
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
        pitch0, roll0 = fpitch, froll
        s_pitch = s_roll = 0.0
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