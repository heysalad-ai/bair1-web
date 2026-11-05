import { requireAuth } from "@/lib/auth";
import { withDeviceRead } from "@/lib/device-access";
import { getLatestReading } from "@/lib/dynamo";
import { factoryUnit, factoryReceipt, FactoryError } from "@/lib/factory-provisioning";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const deviceId = new URL(request.url).searchParams.get("deviceId") ?? "";
    const value = await factoryUnit(auth.user, deviceId);
    const receipt = await withDeviceRead({ kind: "user", user: auth.user }, deviceId, async () => {
      const result = factoryReceipt(value, await getLatestReading(deviceId));
      const current = await factoryUnit(auth.user, deviceId);
      if (current.sessionId !== value.sessionId) throw new FactoryError("Configuration changed. Check the latest setup session again.");
      return result;
    });
    return Response.json({ receipt }, { headers });
  } catch (error) {
    if (error instanceof FactoryError) return Response.json({ error: error.message }, { status: error.status, headers });
    return Response.json({ error: "Receipt unavailable. Reconnect if ownership or access changed." }, { status: 409, headers });
  }
}
