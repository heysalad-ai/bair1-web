import { withDeviceRead, DeviceAccessChanged } from "@/lib/device-access";
import { NextRequest, NextResponse } from "next/server";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";
import { accessibleDevice } from "@/lib/device-access";
import { getReadingPage, getReadings, getReadingsInRange } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["read:readings"],
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { deviceId } = await params;

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 },
      );
    }
    {
      const device = await accessibleDevice(
        { kind: "api-key", principal },
        deviceId,
      );
      if (!device) {
        return NextResponse.json(
          { error: "device not found" },
          { status: 404 },
        );
      }
    }

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (Boolean(from) !== Boolean(to))
      return NextResponse.json(
        { error: "Both range dates are required" },
        { status: 400 },
      );

    const limit = limitParam
      ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 10000)
      : 50;

    if (url.searchParams.get("page") === "true") {
      return NextResponse.json(
        await withDeviceRead({ kind: "api-key", principal }, deviceId, () =>
          getReadingPage(deviceId, {
            from,
            to,
            limit,
            cursor: url.searchParams.get("cursor"),
          }),
        ),
      );
    }
    let readings;
    if (from && to) {
      // Validate ISO date strings
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format. Use ISO 8601." },
          { status: 400 },
        );
      }
      readings = await withDeviceRead(
        { kind: "api-key", principal },
        deviceId,
        () => getReadingsInRange(deviceId, from, to, limit),
      );
      // Apply limit after range query
      readings = readings.slice(0, limit);
    } else {
      readings = await withDeviceRead(
        { kind: "api-key", principal },
        deviceId,
        () => getReadings(deviceId, limit),
      );
    }

    return NextResponse.json({
      data: readings,
      meta: { limit, possiblyTruncated: readings.length === limit },
    });
  } catch (err: unknown) {
    if (err instanceof DeviceAccessChanged)
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    if (err instanceof RangeError)
      return NextResponse.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/v1/devices/[deviceId]/readings] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
