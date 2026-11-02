import { NextRequest, NextResponse } from "next/server";
import { requireApiDevice } from "@/lib/device-access";
import { pollCommands } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

// Device firmware polls this endpoint. Auth: SENSOR_API_KEY (system).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const access = await requireApiDevice(req, deviceId, ["read:devices"]);
  if (access instanceof Response) return access;
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 1), 50);
  const commands = await pollCommands(deviceId, limit);
  return NextResponse.json({ commands });
}
