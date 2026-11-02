import { NextRequest } from "next/server";
import { verifyDeviceShareToken } from "@/lib/device-sharing";
import { getSharedDeviceSnapshot } from "@/lib/shared-device";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  if (!await verifyDeviceShareToken(deviceId, req.nextUrl.searchParams.get("token"))) {
    return Response.json({ error: "share link not found" }, { status: 404 });
  }
  const snapshot = await getSharedDeviceSnapshot(deviceId);
  if (!snapshot || !await verifyDeviceShareToken(deviceId, req.nextUrl.searchParams.get("token"))) return Response.json({ error: "device not found" }, { status: 404 });
  return Response.json(snapshot, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
