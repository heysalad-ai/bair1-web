import { requireUserDevice } from "@/lib/device-access";
import { accessStoreEnabled, createStoredShare, listStoredShares, revokeStoredShare } from "@/lib/access-store";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ deviceId: string }> };

export async function GET(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const access = await requireUserDevice(request, deviceId, "share");
  if (access instanceof Response) return access;
  return Response.json({ enabled: accessStoreEnabled(), shares: await listStoredShares(deviceId, access.device.ownerId) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const access = await requireUserDevice(request, deviceId, "share");
  if (access instanceof Response) return access;
  if (!accessStoreEnabled()) return Response.json({ error: "sharing is not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const hours = body.hours ?? 24;
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) return Response.json({ error: "expiry must be between 1 and 168 hours" }, { status: 400 });
  if ((await listStoredShares(deviceId, access.device.ownerId)).length >= 100) return Response.json({ error: "share limit reached; revoke unused links and wait for expiry cleanup" }, { status: 429 });
  const share = await createStoredShare(deviceId, access.device.ownerId, access.device.ownershipVersion ?? "legacy", hours);
  const url = new URL(`/share/${encodeURIComponent(deviceId)}`, process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bair1.live");
  url.searchParams.set("token", share.token);
  return Response.json({ id: share.id, url: url.toString(), expiresAt: share.expiresAt }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
export async function DELETE(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const access = await requireUserDevice(request, deviceId, "share");
  if (access instanceof Response) return access;
  if (!accessStoreEnabled()) return Response.json({ error: "sharing is not configured" }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[\w-]{1,80}$/.test(id)) return Response.json({ error: "valid share id required" }, { status: 400 });
  try { await revokeStoredShare(deviceId, access.device.ownerId, id); }
  catch { return Response.json({ error: "share not found" }, { status: 404 }); }
  return Response.json({ ok: true });
}
