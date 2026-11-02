import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { requireRole } from "@/lib/auth";
import {
  getAllDevicesRegistry,
  createDevice,
  updateDevice,
  deleteDevice,
  type Device,
} from "@/lib/devices";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const devices = await getAllDevicesRegistry();
  return Response.json({ devices });
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const { deviceId, name, location, lat, lng, ownerId } = body;

  if (!deviceId || !name) {
    return Response.json(
      { error: "deviceId and name required" },
      { status: 400 }
    );
  }

  const device: Device = {
    deviceId,
    name,
    location: location ?? "",
    lat: lat ?? null,
    lng: lng ?? null,
    ownerId: ownerId ?? auth.user.userId,
    orgId: auth.user.orgId,
    status: "provisioning",
    createdAt: new Date().toISOString(),
  };

  try { await createDevice(device, true); }
  catch (error) {
    if (error instanceof ConditionalCheckFailedException) return Response.json({ error: "device already registered" }, { status: 409 });
    throw error;
  }
  return Response.json({ ok: true, device });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const { deviceId, ...updates } = body;

  if (!deviceId) {
    return Response.json({ error: "deviceId required" }, { status: 400 });
  }

  if (updates.ownerId !== undefined || updates.orgId !== undefined) return Response.json({ error: "ownership transfers require a reviewed history migration" }, { status: 409 });
  await updateDevice(deviceId, updates);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) {
    return Response.json({ error: "deviceId required" }, { status: 400 });
  }

  await deleteDevice(deviceId);
  return Response.json({ ok: true });
}
