import { claimEnrollment } from "@/lib/device-enrollment";
import { workspaceRole } from "@/lib/access-store";
import { requireAuth } from "@/lib/auth";
import {
  getDevice,
  getDevicesForUser,
  updateDevice,
  type DeviceStatus,
} from "@/lib/devices";

function parseNullableNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const devices = await getDevicesForUser(auth.user.userId);
  return Response.json({ devices });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const deviceId = String(body.deviceId ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!deviceId || !name) {
    return Response.json(
      { error: "deviceId and name required" },
      { status: 400 }
    );
  }

  const existing = await getDevice(deviceId);
  if (existing?.ownerId) return Response.json({ error: "device already registered" }, { status: 409 });
  if (typeof body.enrollmentCode !== "string" || body.enrollmentCode.length < 20 || body.enrollmentCode.length > 100) {
    return Response.json({ error: "one-time enrollment code required" }, { status: 400 });
  }
  const device = await claimEnrollment(deviceId, body.enrollmentCode, auth.user.userId, auth.user.orgId, name);
  return device ? Response.json({ ok: true, device }) : Response.json({ error: "enrollment is invalid, expired or already used" }, { status: 409 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => ({}));
  const deviceId = String(body.deviceId ?? "").trim();
  if (!deviceId) {
    return Response.json({ error: "deviceId required" }, { status: 400 });
  }

  const existing = await getDevice(deviceId);
  if (!existing || existing.ownerId !== auth.user.userId) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  const allowedStatuses: DeviceStatus[] = ["active", "inactive", "provisioning"];
  const status = allowedStatuses.includes(body.status as DeviceStatus)
    ? (body.status as DeviceStatus)
    : undefined;

  const visibility = ["private", "workspace", "public"].includes(body.visibility) ? body.visibility : undefined;
  const orgId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
  const targetOrg = orgId ?? existing.orgId;
  if ((orgId || visibility === "workspace") && !await workspaceRole(auth.user.userId, targetOrg)) {
    return Response.json({ error: "workspace membership required" }, { status: 403 });
  }
  await updateDevice(deviceId, {
    visibility, orgId,
    name: body.name != null ? String(body.name).trim() : undefined,
    location: body.location != null ? String(body.location).trim() : undefined,
    lat: body.lat !== undefined ? parseNullableNumber(body.lat) : undefined,
    lng: body.lng !== undefined ? parseNullableNumber(body.lng) : undefined,
    status,
  });
  return Response.json({ ok: true });
}
