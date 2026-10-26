import cv2

d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
for marker_id in (23, 24):
    img = cv2.aruco.generateImageMarker(d, marker_id, 600)
    img = cv2.copyMakeBorder(img, 100, 100, 100, 100, cv2.BORDER_CONSTANT, value=255)  # white edge
    cv2.imwrite(f"marker_{marker_id}.png", img)