import { workspaceRole, listWorkspaces } from "./access-store";
import { requireAuth } from "./auth";
import { extractApiKeyFromHeaders, validateApiKey, type ApiKeyPrincipal, type ApiKeyScope } from "./api-keys";
import { getDevice, getDevicesForUser, getDevicesForOrg, getAllDevicesRegistry, type Device } from "./devices";
import type { User } from "./users";

export type DeviceActor = { kind: "user"; user: User } | { kind: "api-key"; principal: ApiKeyPrincipal };

/** A workspace string is not membership. Legacy `default` never grants access. */
export function hasPlatformAccess(actor: DeviceActor): boolean {
  return actor.kind === "user" ? actor.user.role === "super_admin" : actor.principal.type === "system";
}

export type DevicePermission = "read" | "control" | "manage" | "share";
export async function canAccessDevice(actor: DeviceActor, device: Device, permission: DevicePermission = "read"): Promise<boolean> {
  if (actor.kind === "api-key" && actor.principal.deviceId && actor.principal.deviceId !== device.deviceId) return false;
  if (hasPlatformAccess(actor)) return true;
  const userId = actor.kind === "user" ? actor.user.userId : actor.principal.userId;
  if (!userId) return false;
  if (device.ownerId === userId) return true;
  if (actor.kind !== "user" || device.visibility !== "workspace") return false;
  const role = await workspaceRole(userId, device.orgId);
  return Boolean(role && (permission === "read" || role === "owner" || role === "admin"));
}

export async function accessibleDevice(actor: DeviceActor, deviceId: string, permission: DevicePermission = "read"): Promise<Device | null> {
  const device = await getDevice(deviceId);
  return device && await canAccessDevice(actor, device, permission) ? device : null;
}

export async function accessibleDevices(actor: DeviceActor): Promise<Device[]> {
  if (hasPlatformAccess(actor)) return getAllDevicesRegistry();
  const userId = actor.kind === "user" ? actor.user.userId : actor.principal.userId;
  const owned = await getDevicesForUser(userId);
  if (actor.kind === "api-key") return owned.filter(device => !actor.principal.deviceId || device.deviceId === actor.principal.deviceId);
  const workspaces = await listWorkspaces(userId);
  const shared = (await Promise.all(workspaces.map(workspace => getDevicesForOrg(workspace.workspaceId)))).flat();
  const candidates = [...new Map([...owned, ...shared].map(device => [device.deviceId, device])).values()];
  const allowed = await Promise.all(candidates.map(device => canAccessDevice(actor, device)));
  return candidates.filter((_, index) => allowed[index]);
}

export async function requireUserDevice(request: Request, deviceId: string, permission: DevicePermission = "read") {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const device = await accessibleDevice({ kind: "user", user: auth.user }, deviceId, permission);
  return device ? { user: auth.user, device } : Response.json({ error: "device not found" }, { status: 404 });
}

export async function requireApiDevice(request: Request, deviceId: string, scopes: ApiKeyScope[]) {
  const principal = await validateApiKey(extractApiKeyFromHeaders(request.headers), scopes);
  if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
  const device = await accessibleDevice({ kind: "api-key", principal }, deviceId);
  return device ? { principal, device } : Response.json({ error: "device not found" }, { status: 404 });
}
