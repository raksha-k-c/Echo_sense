"""Replace placeholder images in data/<folder> with N normal ultrasound images from the downloaded dataset.

Run:  python fill_data.py
"""
import glob, os, shutil

ROOT = r"C:\Users\Raksha K C\Downloads\dataset_publish_October_2026\dataset publish\organ_classification+anomaly_detection\normal"
N = 30
# data/ folder -> source sub-folder in the dataset's "normal" set
FOLDERS = {"liver": "liver", "gallbladder": "GB", "pancreas": "pancreas", "spleen": "spleen",
           "kidney": "kidney", "pelvis": "UB+prostrate+uterous", "ovaries": "ovaries"}

for dst, src in FOLDERS.items():
    files = sorted(glob.glob(os.path.join(ROOT, src, "*.jpg")))
    if not files:
        print(f"{dst}: no source images, skipped")
        continue
    pick = [files[round(i * (len(files) - 1) / (N - 1))] for i in range(N)]
    out = os.path.join("data", dst)
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(os.path.join(out, "*")):
        os.remove(old)
    for i, f in enumerate(pick, 1):
        shutil.copyfile(f, os.path.join(out, f"{i:02d}.jpg"))
    print(f"{dst}: {len(pick)} images")
