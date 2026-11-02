import { NextRequest, NextResponse } from "next/server";
import { accessibleDevices } from "@/lib/device-access";
import { getLatestReading } from "@/lib/dynamo";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["read:devices"]
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const devices = await accessibleDevices({ kind: "api-key", principal });

    const devicesWithLatest = await Promise.all(
      devices.map(async (device) => {
        const latestReading = await getLatestReading(device.deviceId);
        return {
          ...device,
          latestReading: latestReading ?? null,
        };
      })
    );

    return NextResponse.json({ data: devicesWithLatest });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/v1/devices] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
