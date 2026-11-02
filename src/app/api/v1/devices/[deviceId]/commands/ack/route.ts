import { NextRequest, NextResponse } from "next/server";
import { requireApiDevice } from "@/lib/device-access";
import { ackCommand, getCommand, setDeviceState } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

// Device firmware acks a command here. Auth: SENSOR_API_KEY (system).
// Side effect: for set_led commands, persist the LED state so dashboards can
// read the current value via /state.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const access = await requireApiDevice(req, deviceId, ["write:devices"]);
  if (access instanceof Response) return access;
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  let body: { commandId?: string; ok?: boolean; result?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { commandId, ok, result } = body;
  if (!commandId) {
    return NextResponse.json({ error: "commandId is required" }, { status: 400 });
  }

  const existing = await getCommand(deviceId, commandId);
  await ackCommand(deviceId, commandId, Boolean(ok), result ?? null);

  if (existing?.type === "set_led" && existing.payload) {
    const on = existing.payload["on"];
    const brightness = existing.payload["brightness"];
    if (typeof on === "boolean") {
      await setDeviceState(deviceId, {
        on,
        brightness: typeof brightness === "number" ? brightness : 0,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
