import { NextRequest, NextResponse } from "next/server";
import {
  DeviceAccessChanged,
  withDeviceRead,
  requireApiDevice,
} from "@/lib/device-access";
import { enqueueCommand, type CommandType } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

const VALID_TYPES: CommandType[] = [
  "set_led",
  "read_sps30",
  "clean_sps30",
  "reboot",
  "get_state",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const access = await requireApiDevice(req, deviceId, ["write:devices"]);
  if (access instanceof Response) return access;
  if (!deviceId) {
    return NextResponse.json(
      { error: "deviceId is required" },
      { status: 400 },
    );
  }

  let body: { type?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json(
      { error: "JSON object required" },
      { status: 400 },
    );
  const type = body.type as CommandType | undefined;
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `invalid type. Valid: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const payload =
    body.payload && typeof body.payload === "object" ? body.payload : null;

  if (type === "set_led") {
    const on = payload?.["on"];
    const brightness = payload?.["brightness"];
    if (typeof on !== "boolean") {
      return NextResponse.json(
        { error: "set_led requires payload.on (boolean)" },
        { status: 400 },
      );
    }
    if (
      brightness != null &&
      (typeof brightness !== "number" || brightness < 0 || brightness > 255)
    ) {
      return NextResponse.json(
        { error: "payload.brightness must be 0-255" },
        { status: 400 },
      );
    }
  }

  try {
    const command = await enqueueCommand(
      deviceId,
      type,
      payload,
      access.device,
    );
    return NextResponse.json(
      { commandId: command.commandId, status: command.status, command },
      { status: 202 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Device changed or command storage unavailable; refresh before retrying",
      },
      { status: 409 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const access = await requireApiDevice(req, deviceId, ["read:devices"]);
  if (access instanceof Response) return access;
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 1),
    50,
  );
  const { pollCommands } = await import("@/lib/dynamo");
  try {
    const commands = await withDeviceRead(
      { kind: "api-key", principal: access.principal },
      deviceId,
      () => pollCommands(deviceId, limit),
    );
    return NextResponse.json({ commands });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DeviceAccessChanged
            ? "device not found"
            : "Commands unavailable",
      },
      { status: error instanceof DeviceAccessChanged ? 404 : 503 },
    );
  }
}
