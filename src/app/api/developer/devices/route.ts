import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { requireAuth } from "@/lib/auth";
import {
  createDevice,
  getDevice,
  getDevicesForUser,
  updateDevice,
  type Device,
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

  const device: Device = {
    deviceId,
    name,
    location: String(body.location ?? "").trim(),
    lat: parseNullableNumber(body.lat),
    lng: parseNullableNumber(body.lng),
    ownerId: auth.user.userId,
    orgId: auth.user.orgId,
    status: "provisioning",
    createdAt: new Date().toISOString(),
  };

  try {
    await createDevice(device, true);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return Response.json({ error: "device already registered" }, { status: 409 });
    throw error;
  }
  return Response.json({ ok: true, device });
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

  await updateDevice(deviceId, {
    name: body.name != null ? String(body.name).trim() : undefined,
    location: body.location != null ? String(body.location).trim() : undefined,
    lat: body.lat !== undefined ? parseNullableNumber(body.lat) : undefined,
    lng: body.lng !== undefined ? parseNullableNumber(body.lng) : undefined,
    status,
  });
  return Response.json({ ok: true });
}
