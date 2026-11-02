import { withDeviceRead, DeviceAccessChanged } from "@/lib/device-access";
import { NextRequest, NextResponse } from "next/server";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";
import { accessibleDevice } from "@/lib/device-access";
import { getReadings, getReadingsInRange, Reading } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

function computeAnalytics(readings: Reading[]) {
  if (readings.length === 0) {
    return {
      totalReadings: 0,
      avgAqi: null,
      minAqi: null,
      maxAqi: null,
      avgPm25: null,
      firstReading: null,
      lastReading: null,
    };
  }

  const aqiValues = readings
    .map((r) => r.aqi)
    .filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
  const pm25Values = readings
    .filter((r) => r.pm25 != null)
    .map((r) => r.pm25 as number);
  const timestamps = readings
    .map((r) => r.timestamp)
    .filter(Boolean)
    .sort();

  const sumAqi = aqiValues.reduce((a, b) => a + b, 0);
  const sumPm25 = pm25Values.reduce((a, b) => a + b, 0);

  return {
    totalReadings: readings.length,
    avgAqi: aqiValues.length
      ? Math.round((sumAqi / aqiValues.length) * 100) / 100
      : null,
    minAqi: aqiValues.length ? Math.min(...aqiValues) : null,
    maxAqi: aqiValues.length ? Math.max(...aqiValues) : null,
    avgPm25:
      pm25Values.length > 0
        ? Math.round((sumPm25 / pm25Values.length) * 100) / 100
        : null,
    firstReading: timestamps[0] ?? null,
    lastReading: timestamps[timestamps.length - 1] ?? null,
  };
}

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
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (Boolean(from) !== Boolean(to))
      return NextResponse.json(
        { error: "Both range dates are required" },
        { status: 400 },
      );

    let readings: Reading[];
    if (from && to) {
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
        () => getReadingsInRange(deviceId, from, to),
      );
    } else {
      // Default: fetch up to 10000 readings for analytics
      readings = await withDeviceRead(
        { kind: "api-key", principal },
        deviceId,
        () => getReadings(deviceId, 10000),
      );
    }

    const analytics = computeAnalytics(readings);

    return NextResponse.json({
      data: {
        deviceId,
        ...analytics,
      },
    });
  } catch (err: unknown) {
    if (err instanceof DeviceAccessChanged)
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/v1/devices/[deviceId]/analytics] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
