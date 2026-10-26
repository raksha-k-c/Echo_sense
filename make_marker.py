import cv2
d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
cv2.imwrite("marker_23.png", cv2.aruco.generateImageMarker(d, 23, 600))