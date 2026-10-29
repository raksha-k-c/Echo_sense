#include <Arduino.h>
#include <Wire.h>

const int FSR_PIN = 4, LED_GREEN = 25, LED_RED = 27;
const int MPU_ADDR = 0x68;
const int CONTACT  = 300;    // same as CONTACT in ultrasound.py
const int TOO_HARD = 2500;   // tune after testing

int readFsr() {
  long s = 0;
  for (int i = 0; i < 8; i++) { s += analogRead(FSR_PIN); delay(1); }
  return s / 8;
}

void readPose(float &pitch, float &roll) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B); Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);
  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();
  pitch = atan2((float)ay, sqrt((float)ax * ax + (float)az * az)) * 180.0 / PI;
  roll  = atan2(-(float)ax, (float)az) * 180.0 / PI;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_GREEN, OUTPUT); pinMode(LED_RED, OUTPUT);
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();
}

void loop() {
  int f = readFsr();
  float pitch, roll;
  readPose(pitch, roll);
  digitalWrite(LED_GREEN, f > CONTACT && f <= TOO_HARD);
  digitalWrite(LED_RED,   f > TOO_HARD);
  Serial.printf("%.1f,%.1f,%d\n", pitch, roll, f);
  delay(40);
}