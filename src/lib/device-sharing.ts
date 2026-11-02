import { getDevice } from "./devices";
import { storedShareValid } from "./access-store";

/** Legacy permanent HMAC links are intentionally invalidated by this release. */
export async function verifyDeviceShareToken(deviceId: string, token: string | null | undefined) {
  const device = await getDevice(deviceId);
  return Boolean(device && await storedShareValid(deviceId, token, device.ownerId, device.ownershipVersion ?? "legacy"));
}
