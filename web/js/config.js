/* EchoSense configuration
 * ------------------------------------------------------------------
 * Everything you are likely to tune lives in this one object:
 * scoring weights, pressure/tilt thresholds, regions and organ exercises.
 * Pressure units are the raw FSR readings used by ultrasound.py.
 */
(function (E) {
  E.CONFIG = {
    scoring: {
      // Weights must add up to 1. Score = 100 * sum(weight * component), each component 0..1.
      weights: {
        coverage: 0.40,   // share of required regions reached
        pressure: 0.25,   // share of session time with CONTACT <= force <= TOO_HARD
        tilt:     0.20,   // share of session time with pitch AND roll within tolerance of target
        time:     0.15    // finishing within the expected time
      },
      CONTACT: 300,                // force needed before the probe counts as touching (same as ultrasound.py)
      TOO_HARD: 2500,              // above this: "too much pressure" (same as ultrasound.py / ESP32)
      TOO_HARD_RESET: 0.9,         // a new pressure event needs force to drop below TOO_HARD * this first
      TILT_TOLERANCE_DEG: 15,      // allowed deviation of pitch and roll from target
      TARGET_PITCH: 0,             // target tilt in degrees
      TARGET_ROLL: 0,
      MIN_REGION_SECONDS: 2,       // seconds of contact needed in a region for it to count as "reached"
      MAX_SAMPLE_GAP_SEC: 1,       // longer gaps between samples are not counted as practice time
      TIME_OVERRUN_FACTOR: 2,      // time component falls linearly to 0 at expected time x this
      // Score bands. Each has a text label and a symbol so meaning never relies on colour alone.
      bands: [
        { min: 85, label: 'Excellent',      icon: '★', tone: 'good' },
        { min: 70, label: 'Good',           icon: '✓', tone: 'good' },
        { min: 50, label: 'Developing',     icon: '◐', tone: 'warn' },
        { min: 0,  label: 'Needs practice', icon: '!', tone: 'bad'  }
      ]
    },

    // Body regions in the camera picture, as fractions (x1, y1, x2, y2). Mirrors ZONES in ultrasound.py.
    regions: [
      { name: 'Liver',        dataset: 'Liver',       box: [0.00, 0.0, 0.30, 0.5] },
      { name: 'Gallbladder',  dataset: 'Gallbladder', box: [0.30, 0.0, 0.50, 0.5] },
      { name: 'Pancreas',     dataset: 'Pancreas',    box: [0.50, 0.0, 0.70, 0.5] },
      { name: 'Spleen',       dataset: 'Spleen',      box: [0.70, 0.0, 1.00, 0.5] },
      { name: 'Right kidney', dataset: 'Kidney',      box: [0.00, 0.5, 0.30, 1.0] },
      { name: 'Pelvis',       dataset: 'Pelvis',      box: [0.30, 0.5, 0.50, 1.0] },
      { name: 'Ovaries',      dataset: 'Ovaries',     box: [0.50, 0.5, 0.70, 1.0] },
      { name: 'Left kidney',  dataset: 'Kidney',      box: [0.70, 0.5, 1.00, 1.0] }
    ],

    // Training exercises shown on "Select training".
    organs: [
      { id: 'liver', name: 'Liver', difficulty: 1, expectedSec: 150,
        required: ['Liver', 'Right kidney'],
        description: 'Scan the right upper abdomen and compare the liver with the right kidney (hepatorenal view).' },
      { id: 'gallbladder', name: 'Gallbladder', difficulty: 2, expectedSec: 180,
        required: ['Gallbladder', 'Liver'],
        description: 'Find the dark, pear-shaped gallbladder under the liver edge and keep it in view.' },
      { id: 'kidney', name: 'Kidney (left and right)', difficulty: 2, expectedSec: 180,
        required: ['Right kidney', 'Left kidney'],
        description: 'Locate both kidneys from the flank and keep the full length of each in the image.' },
      { id: 'spleen', name: 'Spleen', difficulty: 3, expectedSec: 200,
        required: ['Spleen', 'Left kidney'],
        description: 'Reach the spleen high behind the left ribs, then slide down to the left kidney.' }
    ],
    difficultyLabels: ['', 'Beginner', 'Intermediate', 'Advanced'],

    feed: {
      defaultMode: 'demo',                              // 'demo' or 'live'
      defaultUrl: 'http://localhost:8000/api/live',     // ws://… (WebSocket) or http://… (polled JSON)
      pollMs: 100,                                      // HTTP polling interval
      staleMs: 1500                                     // no new data for this long = "no signal"
    },

    recordIntervalSec: 0.5,    // spacing of samples saved with a session
    maxStoredSamples: 1500,
    demoAccount: { name: 'Priya Nair', email: 'demo@echosense.app', password: 'echosense123' }
  };
})(globalThis.Echo = globalThis.Echo || {});
