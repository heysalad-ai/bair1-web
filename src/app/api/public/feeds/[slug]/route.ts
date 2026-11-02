import { NextRequest, NextResponse } from "next/server";
import { getPublicFeedSnapshot, PUBLIC_FEEDS, type PublicFeedFilters } from "@/lib/public-feeds";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const feed = PUBLIC_FEEDS[slug];
    const requestedLimit = Number(url.searchParams.get("limit") ?? 120);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 120, 1), 500);
    const pollutantParam = url.searchParams.get("pollutant");
    const pollutant: PublicFeedFilters["pollutant"] =
      pollutantParam === "pm1" || pollutantParam === "pm10" || pollutantParam === "aqi" ? pollutantParam : "pm25";
    const devices = url.searchParams
      .getAll("device")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => feed?.devices.some((device) => device.deviceId === value));
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const includeReferences = url.searchParams.get("references") !== "false";
    const snapshot = await getPublicFeedSnapshot(slug, {
      limit,
      pollutant,
      devices,
      from: from && to ? from : null,
      to: from && to ? to : null,
      includeReferences,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "feed not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=5",
      },
    });
  } catch (err: unknown) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
