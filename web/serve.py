"""EchoSense local server (standard library only).

    python web/serve.py [port]

Serves the dashboard, the image dataset and two small JSON endpoints:
  /api/dataset   image files per organ, read from dataset/tags.csv (made by build_dataset.py)
  /api/live      latest row of session_log.csv, written by ultrasound.py when you press "l".
                 This is the "Live feed" for the Practice screen.
"""
import csv
import json
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

WEB = Path(__file__).resolve().parent
ROOT = WEB.parent
DATASET = ROOT / "dataset"
LOG = ROOT / "session_log.csv"
STALE_AFTER = 3.0          # seconds without a new log row before the probe counts as "not tracked"


def dataset_index():
    """{organ: [relative image paths in sweep order]} from dataset/tags.csv."""
    tags = DATASET / "tags.csv"
    if not tags.exists():
        return {}
    out = {}
    with tags.open(newline="", encoding="utf8") as fh:
        for row in csv.DictReader(fh):
            out.setdefault(row["organ"], []).append(row["file"].replace("\\", "/"))
    return out


def latest_log_row():
    """Last data row of session_log.csv as the JSON the dashboard expects, or None."""
    if not LOG.exists():
        return None
    with LOG.open("rb") as fh:
        header = fh.readline().decode("utf8").strip().split(",")
        fh.seek(0, 2)
        size = fh.tell()
        fh.seek(max(0, size - 4096))
        lines = [l for l in fh.read().decode("utf8", "ignore").splitlines() if l.strip()]
    if len(lines) < 2 or lines[-1].split(",") == header:
        return None
    row = dict(zip(header, next(csv.reader([lines[-1]]))))

    def num(key, default=0.0):
        try:
            return float(row.get(key, ""))
        except ValueError:
            return default

    tracked = row.get("tracked", "1") != "0"
    return {
        "tracked": tracked,
        "x": num("x") if tracked else None,
        "y": num("y") if tracked else None,
        "yaw": num("yaw"), "pitch": num("pitch"), "roll": num("roll"), "force": num("force"),
        "region": row.get("zone", ""), "image": row.get("image", ""),
        "stale": time.time() - num("t") > STALE_AFTER,
    }


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urlparse(path).path
        if path.startswith("/dataset/"):
            self.directory, path = str(DATASET), path[len("/dataset"):]
        else:
            self.directory = str(WEB)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/dataset":
            return self.send_json(dataset_index())
        if route == "/api/live":
            row = latest_log_row()
            if row is None:
                return self.send_json({"error": "No session_log.csv rows yet. Press 'l' in ultrasound.py to start logging."}, 404)
            return self.send_json(row)
        return super().do_GET()

    def log_message(self, fmt, *args):
        if "/api/live" not in (args[0] if args else ""):     # keep the console readable while polling
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"EchoSense running at http://localhost:{port}   (Ctrl+C to stop)")
    if not DATASET.exists():
        print("Note: dataset/ not found. Run build_dataset.py for real images; illustrative ones are used until then.")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
