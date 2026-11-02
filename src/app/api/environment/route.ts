import { requireAuth } from "@/lib/auth";
import { usageGate } from "@/lib/usage-budget";
import { validCoordinates } from "@/lib/request-limits";
import { NextRequest, NextResponse } from "next/server";
import {
  getAirQuality,
  getPollenForecast,
  getWeather,
  reverseGeocode,
} from "@/lib/google-env";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req); if (auth instanceof Response) return auth;
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");

  if (!validCoordinates(lat, lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const limited = await usageGate("environment", auth.user.userId); if (limited) return limited;
  const location = { lat, lng };

  const [airQuality, pollen, weather, address] = await Promise.all([
    getAirQuality(location),
    getPollenForecast(location, 3),
    getWeather(location),
    reverseGeocode(location),
  ]);

  return NextResponse.json({
    airQuality,
    pollen,
    weather,
    address,
    location,
    fetchedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
