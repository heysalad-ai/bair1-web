import { withDeviceRead, DeviceAccessChanged } from "@/lib/device-access";
import { NextRequest, NextResponse } from "next/server";
import { accessibleDevices } from "@/lib/device-access";
import { getLatestReading } from "@/lib/dynamo";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["read:devices"],
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const devices = await accessibleDevices({ kind: "api-key", principal });

    const devicesWithLatest = await Promise.all(
      devices.map(async (device) => {
        const latestReading = await withDeviceRead(
          { kind: "api-key", principal },
          device.deviceId,
          () =>
            withDeviceRead(
              { kind: "api-key", principal },
              device.deviceId,
              () => getLatestReading(device.deviceId),
            ),
        );
        return {
          ...device,
          latestReading: latestReading ?? null,
        };
      }),
    );

    return NextResponse.json({ data: devicesWithLatest });
  } catch (err: unknown) {
    if (err instanceof DeviceAccessChanged)
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/v1/devices] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
