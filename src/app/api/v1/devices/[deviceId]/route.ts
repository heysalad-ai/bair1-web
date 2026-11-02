import { NextRequest, NextResponse } from "next/server";
import { accessibleDevice } from "@/lib/device-access";
import { getLatestReading } from "@/lib/dynamo";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["read:devices"]
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { deviceId } = await params;

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    }

    const device = await accessibleDevice({ kind: "api-key", principal }, deviceId);
    if (!device) {
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    }
    if (!device) {
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    }

    const latestReading = await getLatestReading(deviceId);

    return NextResponse.json({
      data: {
        ...device,
        latestReading: latestReading ?? null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/v1/devices/[deviceId]] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
