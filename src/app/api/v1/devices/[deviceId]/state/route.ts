import { NextRequest, NextResponse } from "next/server";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";
import { getDeviceState, getLatestReading, getNotecardTelemetry } from "@/lib/dynamo";
import { accessibleDevice } from "@/lib/device-access";

export const dynamic = "force-dynamic";

// GET /state — last-known snapshot: latest reading + last acked LED state.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["read:devices"],
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  {
    const device = await accessibleDevice({ kind: "api-key", principal }, deviceId);
    if (!device) {
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    }
  }

  const [reading, state, notecard] = await Promise.all([
    getLatestReading(deviceId),
    getDeviceState(deviceId),
    getNotecardTelemetry(deviceId),
  ]);

  return NextResponse.json({
    deviceId,
    led: state.led,
    lastSeenAt: state.lastSeenAt,
    stateUpdatedAt: state.updatedAt,
    notecard,
    reading: reading ?? null,
  });
}
