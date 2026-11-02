import { NextRequest, NextResponse } from "next/server";
import {
  DeviceAccessChanged,
  withDeviceRead,
  requireApiDevice,
} from "@/lib/device-access";
import { getCommand } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

// GET /commands/[commandId] — poll status of a single command (dashboard uses this).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string; commandId: string }> },
) {
  const { deviceId, commandId } = await params;
  const access = await requireApiDevice(req, deviceId, ["read:devices"]);
  if (access instanceof Response) return access;
  if (!deviceId || !commandId) {
    return NextResponse.json(
      { error: "deviceId and commandId required" },
      { status: 400 },
    );
  }
  try {
    const command = await withDeviceRead(
      { kind: "api-key", principal: access.principal },
      deviceId,
      () => getCommand(deviceId, commandId),
    );
    if (!command) {
      return NextResponse.json({ error: "command not found" }, { status: 404 });
    }
    return NextResponse.json({ command });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DeviceAccessChanged
            ? "device not found"
            : "Command unavailable",
      },
      { status: error instanceof DeviceAccessChanged ? 404 : 503 },
    );
  }
}
