import type { ApiKeyScope } from "./api-keys";

export const UPLOAD_URL = "https://app.bair1.live/api/readings";
export type KeyPurpose = "firmware" | "read" | "custom";
export const keyPresets: Record<
  Exclude<KeyPurpose, "custom">,
  ApiKeyScope[]
> = {
  firmware: ["write:readings"],
  read: ["read:devices", "read:readings", "export:readings"],
};

export function uploadConfig(deviceId: string) {
  return `// Enroll this device in the same account that creates its upload key.\n// Device ID: ${deviceId || "<your enrolled device ID>"}\nstatic const char BAIR1_URL[] = "${UPLOAD_URL}";\nstatic const char BAIR1_API_KEY[] = "<paste your upload key locally>";`;
}
