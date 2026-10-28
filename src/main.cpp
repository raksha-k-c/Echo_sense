#include <Arduino.h>
#include <Wire.h>

const int MPU = 0x68;
const int FSR_PIN = 4;                    // FSR signal is on D4

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission();
}

void loop() {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU, 6, true);

  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();

  float pitch = atan2(-(float)ax, sqrt((float)ay * ay + (float)az * az)) * 180.0 / PI;
  float roll  = atan2((float)ay, (float)az) * 180.0 / PI;
  int force = analogRead(FSR_PIN);          // 0 to 4095

  Serial.printf("%.1f,%.1f,%d\n", pitch, roll, force);
  delay(50);
}