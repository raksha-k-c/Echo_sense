"""Collect organ-labelled ultrasound images into dataset/<Organ>/ and write dataset/tags.csv.

Run once:  python build_dataset.py
Sources are the organ-sorted folders of the published dataset (duplicates are dropped by file hash).
The archive folder (CT images, segmentation masks) holds no organ-sorted ultrasound, so it is not used.
"""
import csv, glob, hashlib, os, shutil

ROOT = r"C:\Users\Raksha K C\Downloads\dataset_publish_October_2026\dataset publish"
OUT = "dataset"
# source sub-folder name -> organ folder in dataset/
ORGANS = {"Liver": "Liver", "GB": "Gallbladder", "Spleen": "Spleen", "Kidney": "Kidney",
          "Pancreas": "Pancreas", "Ovaries": "Ovaries", "UB+prostrate+uterous+cervix": "Pelvis",
          "UB+prostrate+uterous": "Pelvis"}
SOURCES = [("organ_classification_1", ""), ("organ_classification_2", ""),
           ("organ_classification+anomaly_detection", "normal"),
           ("organ_classification+anomaly_detection", "abnormal")]

seen, rows = set(), []
per_organ = {}
for src, sub in SOURCES:
    for folder, organ in ORGANS.items():
        for f in sorted(glob.glob(os.path.join(ROOT, src, sub, folder, "*.jpg"))):
            h = hashlib.md5(open(f, "rb").read()).hexdigest()
            if h in seen:
                continue
            seen.add(h)
            per_organ.setdefault(organ, []).append((f, src))

os.makedirs(OUT, exist_ok=True)
for organ, items in per_organ.items():
    os.makedirs(os.path.join(OUT, organ), exist_ok=True)
    n = len(items)
    for i, (f, src) in enumerate(items):
        name = f"{organ[:3].lower()}_{i:04d}.jpg"
        shutil.copyfile(f, os.path.join(OUT, organ, name))
        # sweep = position along the scan (0..1); pitch/roll = probe tilt the image was taken at.
        # The open dataset has no tilt metadata, so tilt is 0; edit tags.csv once real poses are known.
        rows.append([organ, f"{organ}/{name}", f"{i / max(1, n - 1):.4f}", 0, 0, src])

with open(os.path.join(OUT, "tags.csv"), "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["organ", "file", "sweep", "pitch", "roll", "source"])
    w.writerows(rows)

for organ, items in per_organ.items():
    print(f"{organ:12s} {len(items)}")
print("total", len(rows))
