import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canAccessDevice } from "@/lib/device-access";
import { getDevice } from "@/lib/devices";
import { createDeviceShareToken } from "@/lib/device-sharing";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { deviceId } = await params;
  const device = await getDevice(deviceId);
  const hasAccess = device && canAccessDevice({ kind: "user", user: auth.user }, device);
  if (!hasAccess) return Response.json({ error: "device not found" }, { status: 404 });

  const token = createDeviceShareToken(deviceId);
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bair1.live";
  const url = new URL(`/share/${encodeURIComponent(deviceId)}`, appOrigin);
  url.searchParams.set("token", token);
  return Response.json({ url: url.toString() });
}
