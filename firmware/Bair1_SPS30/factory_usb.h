#pragma once
#include <Preferences.h>

// One NVS value makes configuration replacement atomic. No credentials are echoed.
String runtimeSsid, runtimePassword, runtimeKey, runtimeUrl, factorySessionId;
static constexpr char FACTORY_VERSION[] = "bair1-xiao-sps30-1.0.0";
static constexpr char FACTORY_URL[] = "https://app.bair1.live/api/readings";
String usbCommand;
bool usbOverflow = false;

void loadFactoryConfig() {
  runtimeSsid = WIFI_SSID; runtimePassword = WIFI_PASSWORD;
  runtimeKey = BAIR1_API_KEY; runtimeUrl = BAIR1_URL;
  Preferences preferences;
  if (!preferences.begin("bair1-sps30", true)) return;
  String stored = preferences.getString("config", "");
  preferences.end();
  JsonDocument doc;
  if (stored.length() && !deserializeJson(doc, stored)) {
    runtimeSsid = doc["ssid"].as<String>(); runtimePassword = doc["password"].as<String>();
    runtimeKey = doc["apiKey"].as<String>(); runtimeUrl = doc["url"].as<String>();
    factorySessionId = doc["factorySessionId"].as<String>();
  }
}

void factoryReply(const char *kind, const String &requestId, const char *error = nullptr) {
  JsonDocument reply;
  reply["bair1"] = kind; reply["requestId"] = requestId;
  reply["deviceId"] = deviceId; reply["bootSession"] = bootSession;
  reply["protocolVersion"] = 1; reply["chip"] = "ESP32-S3";
  reply["firmwareVersion"] = FACTORY_VERSION;
  reply["configured"] = runtimeKey.length() > 0 && runtimeSsid.length() > 0;
  if (error) reply["error"] = error;
  serializeJson(reply, Serial); Serial.println();
}

bool validFactorySettings(JsonDocument &doc) {
  if (!doc["ssid"].is<String>() || !doc["password"].is<String>() || !doc["apiKey"].is<String>() || !doc["url"].is<String>() || !doc["factorySessionId"].is<String>()) return false;
  String ssid = doc["ssid"], password = doc["password"], key = doc["apiKey"], url = doc["url"], session = doc["factorySessionId"];
  if (ssid.length() < 1 || ssid.length() > 32 || ssid.length() != strlen(ssid.c_str()) || password.length() > 64 || password.length() != strlen(password.c_str())) return false;
  if (password.length() && password.length() < 8) return false;
  if (password.length() == 64) for (char c : password) if (!isxdigit(c)) return false;
  if (!key.startsWith("bair1_") || key.length() < 30 || key.length() > 128 || url != FACTORY_URL || session.length() != 36) return false;
  for (char c : key) if (!(isalnum(c) || c == '_' || c == '-')) return false;
  for (char c : session) if (!(isxdigit(c) || c == '-')) return false;
  return true;
}

void handleFactoryCommand(const String &line) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) return; // Never echo malformed input, which may contain secrets.
  String action = doc["bair1"] | "", requestId = doc["requestId"] | "";
  if (requestId.length() < 1 || requestId.length() > 64) return;
  if (action == "identify") { factoryReply("identity", requestId); return; }
  if (action != "configure") return;
  if (doc["deviceId"].as<String>() != deviceId || doc["bootSession"].as<String>() != bootSession) {
    factoryReply("error", requestId, "Board changed. Identify this board again."); return;
  }
  if (!validFactorySettings(doc)) { factoryReply("error", requestId, "Invalid settings. Check Wi-Fi details and prepare a new configuration."); return; }
  JsonDocument settings;
  for (const char *field : {"ssid", "password", "apiKey", "url", "factorySessionId"}) settings[field] = doc[field];
  String encoded; serializeJson(settings, encoded);
  Preferences preferences;
  if (!preferences.begin("bair1-sps30", false)) { factoryReply("error", requestId, "Settings storage unavailable."); return; }
  const bool saved = preferences.putString("config", encoded) == encoded.length();
  preferences.end();
  if (!saved) { factoryReply("error", requestId, "Settings were not saved. Retry configuration."); return; }
  factoryReply("configured", requestId);
  Serial.flush(); delay(250); ESP.restart();
}

void pollFactoryUsb() {
  // Bound work per loop so a noisy USB host cannot stop sampling.
  for (unsigned count = 0; count < 256 && Serial.available(); ++count) {
    const char c = Serial.read();
    if (c == '\n') {
      if (!usbOverflow && usbCommand.length()) handleFactoryCommand(usbCommand);
      usbCommand = ""; usbOverflow = false;
    } else if (c != '\r' && !usbOverflow) {
      if (usbCommand.length() >= 2048) { usbCommand = ""; usbOverflow = true; }
      else usbCommand += c;
    }
  }
}
