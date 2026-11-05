/* Factory diagnostic for Saddle Sense RevC 1.0.3: SPS30 I2C 0x69,
 * SDA D4/GPIO5, SCL D5/GPIO6, SEL grounded, regulated 5V sensor power.
 * Samples every 2 seconds; fresh CRC-checked frames only. RAM queue, no flash spool.
 * This build does not implement the complete product's BLE, LED or battery features.
 */
#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2cSps30.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_system.h>
#include <time.h>
#include <atomic>
#include "bair1_config.h"
struct Sample {
  uint32_t sequence, uptimeMs, sensorAgeMs, sensorUptimeMs, status;
  int64_t epochSeconds;
  float pm1, pm25, pm4, pm10, nc05, nc1, nc25, nc4, nc10, particleSize;
  bool valid;
};
SensirionI2cSps30 sensor;
QueueHandle_t samples;
String deviceId, bootSession;
#include "factory_usb.h"
std::atomic<uint32_t> dropped{0};
bool sensorReady = false, configured = false;
uint32_t lastRead = 0, lastRetry = 0, sensorStarted = 0, sequence = 0;

bool startSensor() {
  sensor.wakeUpSequence();
  sensor.stopMeasurement();
  delay(100);
  if (sensor.startMeasurement(SPS30_OUTPUT_FORMAT_OUTPUT_FORMAT_FLOAT)) return false;
  sensorStarted = millis();
  return true;
}
bool massValid(float value) { return isfinite(value) && value >= 0 && value <= 1000; }
bool validFrame(const Sample &s, int16_t error) {
  return !error && s.status == 0 && s.sensorUptimeMs >= 30000 && s.sensorAgeMs <= 2500
    && massValid(s.pm1) && massValid(s.pm25) && massValid(s.pm4) && massValid(s.pm10);
}
void makePayload(const Sample &s, JsonDocument &doc) {
  doc["deviceId"] = deviceId; doc["deviceName"] = DEVICE_NAME;
  doc["firmwareVersion"] = FACTORY_VERSION;
  if (factorySessionId.length()) doc["factorySessionId"] = factorySessionId;
  doc["board"] = "Seeed XIAO ESP32-S3"; doc["transport"] = "wifi";
  doc["bootSession"] = bootSession; doc["schemaVersion"] = 2;
  doc["sequence"] = s.sequence; doc["sample"] = s.sequence;
  doc["eventId"] = bootSession + ":" + String(s.sequence);
  doc["uptimeMs"] = s.uptimeMs;
  if (s.epochSeconds > 0) doc["capturedAt"] = s.epochSeconds;
  else doc["capturedAt"] = nullptr;
  doc["sensorModel"] = "SPS30"; doc["sensorProfile"] = "sps30-i2c";
  doc["sensorInterface"] = "I2C"; doc["pmUnit"] = "ug/m3";
  doc["sps30Valid"] = s.valid; doc["sensorAgeMs"] = s.sensorAgeMs;
  doc["sensorUptimeMs"] = s.sensorUptimeMs; doc["sensorStatus"] = s.status;
  for (const char *name : {"pm1", "pm25", "pm4", "pm10", "nc05", "nc1", "nc25", "nc4", "nc10", "typicalParticleSize"}) doc[name] = nullptr;
  if (s.valid) {
    doc["pm1"] = s.pm1; doc["pm25"] = s.pm25; doc["pm4"] = s.pm4; doc["pm10"] = s.pm10;
    doc["nc05"] = s.nc05; doc["nc1"] = s.nc1; doc["nc25"] = s.nc25; doc["nc4"] = s.nc4; doc["nc10"] = s.nc10;
    doc["typicalParticleSize"] = s.particleSize;
  }
  doc["numberUnit"] = "#/cm3"; doc["particleSizeUnit"] = "um";
  doc["aqi"] = nullptr; doc["droppedSamples"] = dropped.load();
}

bool accepted(int status, const String &body) {
  if (status < 200 || status >= 300) return false;
  JsonDocument reply;
  if (deserializeJson(reply, body) || !reply["ok"].is<bool>() ||
      !reply["ok"].as<bool>()) return false;
  String outcome = reply["outcome"] | "";
  if (outcome == "conflict") return false;
  return reply["stored"] == true || outcome == "duplicate";
}

void uploadTask(void *) {
  uint32_t lastWifiAttempt = millis() - WIFI_RETRY_MS;
  uint32_t retryMs = 2000;
  bool authBlocked = false;
  uint8_t authFailures = 0;
  for (;;) {
    if (authBlocked) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
        lastWifiAttempt = millis();
        WiFi.begin(runtimeSsid.c_str(), runtimePassword.c_str());
      }
      vTaskDelay(pdMS_TO_TICKS(250)); continue;
    }
    // Reliable time is required both for TLS and duplicate-safe capture keys.
    if (time(nullptr) < 1700000000) {
      vTaskDelay(pdMS_TO_TICKS(1000)); continue;
    }
    Sample s;
    if (xQueuePeek(samples, &s, pdMS_TO_TICKS(500)) != pdTRUE) continue;
    JsonDocument doc;
    makePayload(s, doc);
    String payload;
    serializeJson(doc, payload);
    WiFiClientSecure tls;
    tls.setCACert(BAIR1_ROOT_CA);
    tls.setHandshakeTimeout(10);
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    int status = -1;
    bool ok = false;
    if (http.begin(tls, runtimeUrl)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", String("Bearer ") + runtimeKey);
      status = http.POST(payload);
      if (status > 0) ok = accepted(status, http.getString());
      http.end();
    }
    if (ok) {
      authFailures = 0;
      xQueueReceive(samples, &s, 0);
      retryMs = 2000;
      Serial.printf("Upload acknowledged; queued=%u\n", unsigned(uxQueueMessagesWaiting(samples)));
      vTaskDelay(pdMS_TO_TICKS(100));
    } else {
      Serial.printf("Upload not acknowledged; HTTP=%d; keeping sample\n", status);
      // Newly issued key indexes may take a moment to replicate. Retry within a
      // bounded initial window before treating persistent rejection as final.
      if ((status == 401 || status == 403) && ++authFailures >= 5) {
        authBlocked = true;
        Serial.println("Check API key permissions; restart after correcting configuration.");
      }
      vTaskDelay(pdMS_TO_TICKS(retryMs));
      retryMs = retryMs < 30000 ? retryMs * 2 : 60000;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(D4, D5); Wire.setClock(100000); Wire.setTimeOut(100);
  sensor.begin(Wire, SPS30_I2C_ADDR_69);
  sensorReady = startSensor();
  char id[32], boot[40];
  uint64_t mac = ESP.getEfuseMac();
  snprintf(id, sizeof(id), "XIAO-%04X%08X", unsigned(mac >> 32), unsigned(mac));
  snprintf(boot, sizeof(boot), "%08X%08X%08X%08X", unsigned(esp_random()),
    unsigned(esp_random()), unsigned(esp_random()), unsigned(esp_random()));
  deviceId = id;
  bootSession = boot;
  loadFactoryConfig();
  samples = xQueueCreate(QUEUE_LENGTH, sizeof(Sample));
  configured = samples && runtimeSsid.length() && runtimeKey.length() && runtimeUrl.length();
  if (configured) {
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    if (xTaskCreate(uploadTask, "bair1-upload", 12288, nullptr, 1, nullptr) != pdPASS) {
      configured = false;
      Serial.println("Upload task allocation failed; serial measurements only.");
    }
  } else Serial.println("Use the Bair1 factory USB tool to configure Wi-Fi and uploads; serial measurements only.");
}

void loop() {
  pollFactoryUsb();
  uint32_t now = millis();
  if (!sensorReady && now - lastRetry >= 30000) { lastRetry = now; sensorReady = startSensor(); }
  if (now - lastRead < SAMPLE_INTERVAL_MS) { delay(5); return; }
  lastRead = now;
  Sample s{}; s.sequence = ++sequence; s.uptimeMs = now;
  s.sensorAgeMs = 0; s.sensorUptimeMs = now - sensorStarted; s.status = 0xffffffff;
  time_t utc = time(nullptr); s.epochSeconds = utc >= 1700000000 ? int64_t(utc) : 0;
  uint16_t ready = 0;
  if (sensorReady) {
    // Driver rejects I2C errors and CRC failures. Never reuse a previous frame.
    int16_t error = sensor.readDataReadyFlag(ready);
    if (!error && ready) {
      error = sensor.readMeasurementValuesFloat(s.pm1, s.pm25, s.pm4, s.pm10,
        s.nc05, s.nc1, s.nc25, s.nc4, s.nc10, s.particleSize);
      if (!error) error = sensor.readDeviceStatusRegister(s.status);
      s.sensorAgeMs = millis() - now;
      s.valid = validFrame(s, error);
    }
    if (error) sensorReady = false;
  }
  // Failed/missing/warming readings are explicit nulls, never fabricated zeros.
  if (configured && (s.epochSeconds == 0 || xQueueSend(samples, &s, 0) != pdTRUE)) ++dropped;
  JsonDocument serialDoc; makePayload(s, serialDoc); serializeJson(serialDoc, Serial); Serial.println();
}
