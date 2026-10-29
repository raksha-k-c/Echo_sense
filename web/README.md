# EchoSense dashboard

Trainee-facing web dashboard for the EchoSense probe trainer. It shows live probe data, scores each
session and tracks progress. No build step and no dependencies: plain HTML, CSS and JavaScript.

## Run it

```
python web/serve.py          # then open http://localhost:8000
python web/serve.py 8080     # or pick another port
```

Python 3.8+ is enough (standard library only). `serve.py` also serves the ultrasound images from
`../dataset/` and the live endpoints below. If you only open `web/index.html` directly, everything
works except real images (illustrative drawings are shown instead) and the HTTP live feed.

Click **Explore with the demo account** on the login screen for a 14-session history
(`demo@echosense.app` / `echosense123`). New accounts start empty so you can see the empty states;
the dashboard has a **Load sample sessions** button.

Accounts, sessions and settings live in the browser's localStorage. There is no server-side
authentication, so this is a single-machine training tool, not a secure system.

## Screens

Login / Sign up · Dashboard · Select training · Practice (live) · Session results · My progress · Learning library.

## Live data

On the Practice screen open **Data source settings**.

* **Demo mode** (default, clearly labelled) simulates a trainee. The slider sets their skill level.
* **Live feed** reads JSON from a WebSocket (`ws://…`) or an HTTP endpoint (`http://…`, polled every 100 ms):

```json
{ "x": 0.41, "y": 0.22, "yaw": 12.0, "pitch": -3.5, "roll": 4.1, "force": 820, "region": "Liver", "image": "Liver/liv_0100.jpg" }
```

`x`, `y` are 0 to 1 across the camera picture. `region` is one of Liver, Gallbladder, Pancreas, Spleen,
Right kidney, Pelvis, Ovaries, Left kidney (if missing it is worked out from x, y). `image` is a path
inside `dataset/` or a bare file name. Optional: `tracked` (false when the marker is lost).

**Using the existing Python program:** `serve.py` provides `http://localhost:8000/api/live`, the newest row of
`session_log.csv`. Run `ultrasound.py`, press **l** to start logging, then choose Live feed with that address.
`ultrasound.py` itself does not need to change.

## Importing a session log

On the dashboard press **Import session log** and choose a CSV written by `ultrasound.py`
(columns `t, tracked, x, y, yaw, pitch, roll, force, contact, zone, image`). Rows with invalid numbers are skipped
and reported. You pick which exercise it was (the best match is preselected) and it is scored like a live session.

## Scoring (edit `js/config.js`)

All weights and thresholds are in one object, `CONFIG.scoring`:

| Part | Weight | Measured as |
|---|---|---|
| Coverage | 40% | required regions reached (at least `MIN_REGION_SECONDS` of contact) / required regions |
| Pressure control | 25% | share of session time with `CONTACT <= force <= TOO_HARD` |
| Tilt accuracy | 20% | share of session time with pitch and roll within `TILT_TOLERANCE_DEG` of target |
| Time | 15% | 100% up to the expected time, falling to 0% at expected × `TIME_OVERRUN_FACTOR` |

Defaults: `CONTACT` 300 and `TOO_HARD` 2500 (same as `ultrasound.py`), tolerance 15°. Pressure and tilt are measured
over the whole session, so lost contact counts against both. A "too much pressure" event is one rise above `TOO_HARD`.
The required regions and expected time of each exercise are in `CONFIG.organs`.

## Code map

```
index.html           page shell, loads the scripts in order
css/styles.css       theme variables (light/dark) and layout
js/config.js         scoring, thresholds, regions, exercises
js/scoring.js        session analysis, score, "areas to practise" text
js/store.js          localStorage: users, sessions, settings
js/sim.js            demo-mode simulator and sample history
js/feed.js           WebSocket / HTTP live feed
js/images.js         dataset images, illustrative fallback
js/importer.js       CSV session import
js/charts.js         SVG/HTML charts
js/app.js            sidebar, theme, router;  js/view-*.js  one file per screen
serve.py             local server and /api endpoints
```

## Accessibility

Keyboard navigable with visible focus, skip link, labelled form fields with error messages, status shown with
icon and text as well as colour, charts have text values plus a "view as table" option, respects reduced motion.
Images: open datasets, CC BY 4.0 (Karim 2025, MSU Scholars Junction). Training aid only, not for diagnosis.
