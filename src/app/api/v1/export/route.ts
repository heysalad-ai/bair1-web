import { csvField } from "@/lib/csv";
import { readingFieldNames } from "@/lib/measurement-contract";
import { NextRequest, NextResponse } from "next/server";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";
import { accessibleDevice, accessibleDevices } from "@/lib/device-access";
import { getReadings, getReadingsInRange, Reading } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10000;

function readingsToCsv(readings: Reading[]): string {
  const headers = readingFieldNames;

  const rows = readings.map((r) =>
    headers.map((h) => csvField(r[h as keyof Reading])).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export async function GET(req: NextRequest) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["export:readings"]
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "json";
    const deviceParam = url.searchParams.get("device");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (Boolean(from) !== Boolean(to)) return NextResponse.json({ error: "Both range dates are required" }, { status: 400 });
    const limitParam = url.searchParams.get("limit");

    if (format !== "json" && format !== "csv") {
      return NextResponse.json(
        { error: "Invalid format. Use 'json' or 'csv'." },
        { status: 400 }
      );
    }

    const limit = limitParam
      ? Math.min(Math.max(1, parseInt(limitParam, 10) || DEFAULT_LIMIT), MAX_LIMIT)
      : DEFAULT_LIMIT;

    // Determine which devices to export
    let deviceIds: string[];
    if (deviceParam) {
      {
        const device = await accessibleDevice({ kind: "api-key", principal }, deviceParam);
        if (!device) {
          return NextResponse.json({ error: "device not found" }, { status: 404 });
        }
      }
      deviceIds = [deviceParam];
    } else {
      deviceIds = (await accessibleDevices({ kind: "api-key", principal })).map(device => device.deviceId);
    }

    // Gather readings
    let allReadings: Reading[] = [];
    for (const deviceId of deviceIds) {
      let readings: Reading[];
      if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          return NextResponse.json(
            { error: "Invalid date format. Use ISO 8601." },
            { status: 400 }
          );
        }
        readings = await getReadingsInRange(deviceId, from, to, limit);
      } else {
        readings = await getReadings(deviceId, limit);
      }
      allReadings = allReadings.concat(readings);
      if (allReadings.length >= limit) break;
    }

    // Apply limit
    allReadings = allReadings.slice(0, limit);

    if (format === "csv") {
      const csv = readingsToCsv(allReadings);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Bair1-Export-Limit": String(limit),
          "X-Bair1-Possibly-Truncated": String(allReadings.length === limit),
          "Content-Disposition": `attachment; filename="bair1-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: allReadings, meta: { limit, possiblyTruncated: allReadings.length === limit, retentionDays: 14 } });
  } catch (err: unknown) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[api/v1/export] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
