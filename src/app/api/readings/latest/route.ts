import { publicReading } from "@/lib/public-reading";
import { getDevice } from "@/lib/devices";
import { NextResponse } from "next/server";
import { PUBLIC_FEEDS } from "@/lib/public-feeds";
import { getLatestReading } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ids = [
      ...new Set(
        Object.values(PUBLIC_FEEDS).flatMap((feed) =>
          feed.devices.map((device) => device.deviceId),
        ),
      ),
    ];
    const readings = await Promise.all(
      ids.map(async (id) => {
        const before = await getDevice(id);
        if (before?.visibility !== "public") return null;
        const reading = await getLatestReading(id);
        const after = await getDevice(id);
        return after?.visibility === "public" &&
          after.ownerId === before.ownerId &&
          after.ownershipVersion === before.ownershipVersion
          ? reading
          : null;
      }),
    );
    const reading = readings
      .filter((item) => item !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    if (!reading) {
      return NextResponse.json({ error: "no readings" }, { status: 404 });
    }
    return NextResponse.json(publicReading(reading));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
