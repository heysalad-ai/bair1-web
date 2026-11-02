import { csvField } from "@/lib/csv";
import {
  withDeviceRead,
  DeviceAccessChanged,
  requireUserDevice,
} from "@/lib/device-access";
import { getReadingPage, getReadings, getReadingsInRange } from "@/lib/dynamo";
import {
  readingFieldNames,
  readingSchemaVersion,
} from "@/lib/measurement-contract";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const access = await requireUserDevice(request, deviceId);
  if (access instanceof Response) return access;
  const query = new URL(request.url).searchParams;
  const from = query.get("from"),
    to = query.get("to");
  if (Boolean(from) !== Boolean(to))
    return Response.json(
      { error: "Both range dates are required" },
      { status: 400 },
    );
  try {
    if (query.get("format") !== "csv")
      return Response.json(
        {
          ...(await withDeviceRead(
            { kind: "user", user: access.user },
            deviceId,
            () =>
              getReadingPage(deviceId, {
                from,
                to,
                cursor: query.get("cursor"),
                limit: Number(query.get("limit")) || 200,
              }),
          )),
          schemaVersion: readingSchemaVersion,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const limit = 10000;
    const readings =
      from && to
        ? await withDeviceRead(
            { kind: "user", user: access.user },
            deviceId,
            () => getReadingsInRange(deviceId, from, to, limit),
          )
        : await withDeviceRead(
            { kind: "user", user: access.user },
            deviceId,
            () => getReadings(deviceId, limit),
          );
    const csv = [
      readingFieldNames.join(","),
      ...readings.map((reading) =>
        readingFieldNames.map((field) => csvField(reading[field])).join(","),
      ),
    ].join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bair1-readings.csv"',
        "Cache-Control": "private, no-store",
        "X-Bair1-Export-Limit": String(limit),
        "X-Bair1-Possibly-Truncated": String(readings.length === limit),
      },
    });
  } catch (error) {
    if (error instanceof DeviceAccessChanged)
      return Response.json({ error: "device not found" }, { status: 404 });
    if (error instanceof RangeError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: "Readings are temporarily unavailable" },
      { status: 503 },
    );
  }
}
