/* XIAO ESP32-S3: BME280 D4/D5, ADC D3/D2; D6 tied to D2 stays INPUT.
 * Samples every 2 s; a separate task uploads without blocking sampling.
 * Queue is RAM only: newest samples are dropped when full; reboot loses queue.
 */
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_system.h>
#include <time.h>
#include <atomic>
#include "bair1_config.h"

struct Sample {
  uint32_t sequence, uptimeMs;
  int64_t epochSeconds;
  float temperature, humidity, pressure, altitude;
  uint16_t d3Raw, d2Raw;
  uint32_t d3Mv, d2Mv;
  bool bmeValid;
};
Adafruit_BME280 bme;
QueueHandle_t samples;
String deviceId, bootSession;
std::atomic<uint32_t> dropped{0};
bool bmeReady = false, configured = false;
uint32_t lastRead = 0, lastBmeRetry = 0, sequence = 0;

bool startBme() {
  if (!bme.begin(0x76, &Wire) && !bme.begin(0x77, &Wire)) return false;
  bme.setSampling(Adafruit_BME280::MODE_NORMAL,
    Adafruit_BME280::SAMPLING_X2, Adafruit_BME280::SAMPLING_X16,
    Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::FILTER_X16,
    Adafruit_BME280::STANDBY_MS_500);
  return true;
}

void makePayload(const Sample &s, JsonDocument &doc) {
  doc["deviceId"] = deviceId;
  doc["deviceName"] = DEVICE_NAME;
  doc["firmwareVersion"] = "bair1-xiao-bme-adc-1.0.0";
  doc["board"] = "Seeed XIAO ESP32-S3";
  doc["transport"] = "wifi";
  doc["bootSession"] = bootSession;
  doc["sequence"] = s.sequence;
  doc["sample"] = s.sequence;
  doc["eventId"] = bootSession + ":" + String(s.sequence);
  doc["uptimeMs"] = s.uptimeMs;
  if (s.epochSeconds > 0) doc["capturedAt"] = s.epochSeconds;
  else doc["capturedAt"] = nullptr;
  doc["bmeValid"] = s.bmeValid;
  doc["environmentSource"] = "BME280";
  doc["temperature"] = nullptr;
  doc["humidity"] = nullptr;
  doc["pressure"] = nullptr;
  doc["altitudeMeters"] = nullptr;
  if (s.bmeValid) {
    doc["temperature"] = s.temperature; // Celsius
    doc["humidity"] = s.humidity;       // percent RH
    doc["pressure"] = s.pressure;       // hPa, matching Bair1
    doc["altitudeMeters"] = s.altitude; // pressure-derived estimate
  }
  doc["seaLevelPressureHpa"] = SEA_LEVEL_HPA;
  doc["adcD3Raw"] = s.d3Raw;
  doc["adcD3PinVoltage"] = s.d3Mv / 1000.0f;
  doc["adcD3InputVoltage"] = s.d3Mv / 1000.0f * D3_DIVIDER_GAIN;
  doc["adcD2Raw"] = s.d2Raw;
  doc["adcD2PinVoltage"] = s.d2Mv / 1000.0f;
  doc["adcD2InputVoltage"] = s.d2Mv / 1000.0f * D2_DIVIDER_GAIN;
  doc["adcD3DividerGain"] = D3_DIVIDER_GAIN;
  doc["adcD2DividerGain"] = D2_DIVIDER_GAIN;
  doc["adcD3Saturated"] = s.d3Raw >= 4095;
  doc["adcD2Saturated"] = s.d2Raw >= 4095;
  doc["aqi"] = nullptr; // No particulate sensor or calibrated AQI algorithm.
  doc["droppedSamples"] = dropped.load();
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
  for (;;) {
    if (authBlocked) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
        lastWifiAttempt = millis();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
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
    if (http.begin(tls, BAIR1_URL)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", String("Bearer ") + BAIR1_API_KEY);
      status = http.POST(payload);
      if (status > 0) ok = accepted(status, http.getString());
      http.end();
    }
    if (ok) {
      xQueueReceive(samples, &s, 0);
      retryMs = 2000;
      Serial.printf("Upload acknowledged; queued=%u\n", unsigned(uxQueueMessagesWaiting(samples)));
      vTaskDelay(pdMS_TO_TICKS(100));
    } else {
      Serial.printf("Upload not acknowledged; HTTP=%d; keeping sample\n", status);
      if (status == 401 || status == 403) {
        authBlocked = true;
        Serial.println("Check API key permissions; restart after correcting configuration.");
      }
      vTaskDelay(pdMS_TO_TICKS(retryMs));
      retryMs = retryMs < 30000 ? retryMs * 2 : 60000;
    }
  }
}

void setup() {
  pinMode(D6, INPUT); // No pull-up/down; electrically tied to D2.
  pinMode(D3, INPUT);
  pinMode(D2, INPUT);
  Serial.begin(115200); // Do not wait for a USB host.
  analogReadResolution(12);
  analogSetPinAttenuation(D3, ADC_11db);
  analogSetPinAttenuation(D2, ADC_11db);
  Wire.begin(D4, D5);
  Wire.setTimeOut(100);
  bmeReady = startBme();
  char id[32], boot[40];
  uint64_t mac = ESP.getEfuseMac();
  snprintf(id, sizeof(id), "XIAO-%04X%08X", unsigned(mac >> 32), unsigned(mac));
  snprintf(boot, sizeof(boot), "%08X%08X%08X%08X", unsigned(esp_random()),
    unsigned(esp_random()), unsigned(esp_random()), unsigned(esp_random()));
  deviceId = id;
  bootSession = boot;
  samples = xQueueCreate(QUEUE_LENGTH, sizeof(Sample));
  configured = samples && strlen(WIFI_SSID) && strlen(BAIR1_API_KEY) && strlen(BAIR1_URL);
  if (configured) {
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    if (xTaskCreate(uploadTask, "bair1-upload", 12288, nullptr, 1, nullptr) != pdPASS) {
      configured = false;
      Serial.println("Upload task allocation failed; serial measurements only.");
    }
  } else Serial.println("Fill bair1_config.h to enable upload; serial measurements only.");
}

void loop() {
  uint32_t now = millis();
  if (!bmeReady && now - lastBmeRetry >= 30000) {
    lastBmeRetry = now;
    bmeReady = startBme();
  }
  if (now - lastRead < SAMPLE_INTERVAL_MS) { delay(5); return; }
  lastRead = now;
  Sample s{};
  s.sequence = ++sequence;
  s.uptimeMs = now;
  time_t utc = time(nullptr);
  s.epochSeconds = utc >= 1700000000 ? int64_t(utc) : 0;
  if (bmeReady) {
    s.temperature = bme.readTemperature();
    s.humidity = bme.readHumidity();
    s.pressure = bme.readPressure() / 100.0f;
    s.bmeValid = isfinite(s.temperature) && isfinite(s.humidity) && isfinite(s.pressure)
      && s.temperature >= -40 && s.temperature <= 85 && s.humidity >= 0
      && s.humidity <= 100 && s.pressure >= 300 && s.pressure <= 1100;
    if (s.bmeValid) s.altitude = 44330.0f * (1.0f - powf(s.pressure / SEA_LEVEL_HPA, 0.1903f));
    else bmeReady = false;
  }
  // Raw and calibrated values are successive ADC conversions, not the same sample.
  s.d3Raw = analogRead(D3);
  s.d3Mv = analogReadMilliVolts(D3);
  s.d2Raw = analogRead(D2);
  s.d2Mv = analogReadMilliVolts(D2);
  if (configured && (s.epochSeconds == 0 || xQueueSend(samples, &s, 0) != pdTRUE)) ++dropped;
  JsonDocument serialDoc;
  makePayload(s, serialDoc);
  serializeJson(serialDoc, Serial);
  Serial.println();
}
