export const FACTORY_FIRMWARE_VERSION = "bair1-xiao-bme-adc-1.1.0";
export const FACTORY_UPLOAD_URL = "https://app.bair1.live/api/readings";
export type BoardIdentity = { deviceId: string; bootSession: string; firmwareVersion: string; protocolVersion: number; chip: string };
/** Arduino stores the six eFuse MAC bytes in a little-endian uint64_t before formatting. */
export function deviceIdFromMac(mac: string): string {
  if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) throw new Error("The board returned an invalid hardware identity.");
  return `XIAO-${mac.split(":").reverse().join("").toUpperCase()}`;
}
export function parseIdentity(value: unknown, requestId: string): BoardIdentity | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.bair1 !== "identity" || v.requestId !== requestId || v.protocolVersion !== 1 || v.chip !== "ESP32-S3" || typeof v.deviceId !== "string" || !/^XIAO-[0-9A-F]{12}$/.test(v.deviceId) || typeof v.bootSession !== "string" || !/^[0-9A-F]{32}$/.test(v.bootSession) || typeof v.firmwareVersion !== "string") return null;
  return { deviceId: v.deviceId, bootSession: v.bootSession, firmwareVersion: v.firmwareVersion, protocolVersion: 1, chip: "ESP32-S3" };
}
export function validateWifi(ssid: string, password: string) {
  if (!ssid || new TextEncoder().encode(ssid).length > 32 || ssid.includes("\0")) throw new Error("Enter the 2.4 GHz Wi-Fi name (1-32 bytes).");
  const bytes = new TextEncoder().encode(password).length;
  if (password.includes("\0") || (bytes !== 0 && (bytes < 8 || bytes > 64 || (bytes === 64 && !/^[0-9a-f]{64}$/i.test(password))))) throw new Error("Wi-Fi password must be 8-63 bytes, a 64-digit hexadecimal key, or blank for an open network.");
}
export function configurationCommand(identity: BoardIdentity, input: { ssid: string; password: string; apiKey: string; factorySessionId: string }, requestId: string) {
  validateWifi(input.ssid, input.password);
  if (!/^bair1_[A-Za-z0-9_-]{24,122}$/.test(input.apiKey) || !/^[0-9a-f-]{36}$/i.test(input.factorySessionId)) throw new Error("Prepare a fresh upload configuration.");
  return { bair1: "configure", requestId, deviceId: identity.deviceId, bootSession: identity.bootSession, ...input, url: FACTORY_UPLOAD_URL };
}
