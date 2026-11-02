import { requireAuth } from "./auth";
import { extractApiKeyFromHeaders, validateApiKey, type ApiKeyPrincipal, type ApiKeyScope } from "./api-keys";
import { getDevice, getDevicesForUser, getAllDevicesRegistry, type Device } from "./devices";
import type { User } from "./users";

export type DeviceActor = { kind: "user"; user: User } | { kind: "api-key"; principal: ApiKeyPrincipal };

/** A workspace string is not membership. Legacy `default` never grants access. */
export function hasPlatformAccess(actor: DeviceActor): boolean {
  return actor.kind === "user" ? actor.user.role === "super_admin" : actor.principal.type === "system";
}

export function canAccessDevice(actor: DeviceActor, device: Device): boolean {
  if (hasPlatformAccess(actor)) return true;
  return device.ownerId === (actor.kind === "user" ? actor.user.userId : actor.principal.userId);
}

export async function accessibleDevice(actor: DeviceActor, deviceId: string): Promise<Device | null> {
  const device = await getDevice(deviceId);
  return device && canAccessDevice(actor, device) ? device : null;
}

export async function accessibleDevices(actor: DeviceActor): Promise<Device[]> {
  return hasPlatformAccess(actor) ? getAllDevicesRegistry()
    : getDevicesForUser(actor.kind === "user" ? actor.user.userId : actor.principal.userId);
}

export async function requireUserDevice(request: Request, deviceId: string) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const device = await accessibleDevice({ kind: "user", user: auth.user }, deviceId);
  return device ? { user: auth.user, device } : Response.json({ error: "device not found" }, { status: 404 });
}

export async function requireApiDevice(request: Request, deviceId: string, scopes: ApiKeyScope[]) {
  const principal = await validateApiKey(extractApiKeyFromHeaders(request.headers), scopes);
  if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
  const device = await accessibleDevice({ kind: "api-key", principal }, deviceId);
  return device ? { principal, device } : Response.json({ error: "device not found" }, { status: 404 });
}
