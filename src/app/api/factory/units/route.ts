import { requireAuth } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-limits";
import { enrollFactoryUnit, configureFactoryUnit, listFactoryUnits, FactoryError } from "@/lib/factory-provisioning";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof FactoryError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 400, headers });
  return Response.json({ error: "Factory service unavailable. Retry without disconnecting the board." }, { status: 503, headers });
}
export async function GET(request: Request) {
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  try { return Response.json(await listFactoryUnits(auth.user), { headers }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const auth = await requireAuth(request); if (auth instanceof Response) return auth;
  try {
    const body = await readJsonObject(request, 2048);
    if (typeof body.deviceId !== "string" || !["enroll", "configure"].includes(String(body.action))) throw new FactoryError("Device identity and action required", 400);
    return Response.json(body.action === "enroll" ? await enrollFactoryUnit(auth.user, body.deviceId) : await configureFactoryUnit(auth.user, body.deviceId), { headers });
  } catch (error) { return failure(error); }
}
