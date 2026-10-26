# EchoSense

Low-cost ultrasound probe training simulator, by Raksha K C.

A dummy probe is tracked with a webcam (ArUco marker) and an ESP32 (MPU6050 tilt + FSR pressure).
The software shows the ultrasound image tagged closest to the probe pose, with gain/TGC controls.

## Run
1. `pip install opencv-python numpy pyserial`
2. Put the organ-sorted ultrasound images in a folder and set `ROOT` in `build_dataset.py`, then `python build_dataset.py`
3. Set `SERIAL_PORT` in `ultrasound.py`, then `python ultrasound.py`

The ESP32 sends one line per reading: `pitch,roll,force` at 115200 baud.

Keys: `[` `]` gain, `,` `.` TGC, `z` zero tilt, `l` log session, `q` quit.

Images: open datasets (CC BY 4.0), Karim 2025, MSU Scholars Junction.
