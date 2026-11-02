import { getDevice } from "./devices";
import { accessStoreEnabled, storedShareValid } from "./access-store";

/** Legacy permanent HMAC links are intentionally invalidated by this release. */
export async function verifyDeviceShareToken(deviceId: string, token: string | null | undefined) {
  if (!accessStoreEnabled() || typeof token !== "string" || !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(deviceId)) return false;
  const device = await getDevice(deviceId);
  return Boolean(device && await storedShareValid(deviceId, token, device.ownerId, device.ownershipVersion ?? "legacy"));
}
