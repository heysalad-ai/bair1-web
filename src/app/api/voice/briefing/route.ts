import { usageGate } from "@/lib/usage-budget";
import { validCoordinates } from "@/lib/request-limits";
import { requireAuth } from "@/lib/auth";
import { withDeviceRead, accessibleDevice } from "@/lib/device-access";
import { NextRequest, NextResponse } from "next/server";
import { getLatestReading } from "@/lib/dynamo";
import { getAirQuality, getWeather, getPollenForecast } from "@/lib/google-env";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  const rawLat = req.nextUrl.searchParams.get("lat"),
    rawLng = req.nextUrl.searchParams.get("lng");
  const hasLocation = rawLat !== null || rawLng !== null;
  const lat = Number.parseFloat(rawLat ?? ""),
    lng = Number.parseFloat(rawLng ?? "");

  if (
    deviceId &&
    !(await accessibleDevice({ kind: "user", user: auth.user }, deviceId))
  ) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }

  if (hasLocation && !validCoordinates(lat, lng))
    return NextResponse.json(
      { error: "Valid coordinates required" },
      { status: 400 },
    );
  const limited = await usageGate("voice", auth.user.userId);
  if (limited) return limited;
  let sensorReading;
  try {
    sensorReading = deviceId
      ? await withDeviceRead({ kind: "user", user: auth.user }, deviceId, () =>
          getLatestReading(deviceId),
        )
      : null;
  } catch {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }
  // Gather external context only after the authorized measurement is available.
  const [googleAq, weather, pollen] = await Promise.all([
    hasLocation ? getAirQuality({ lat, lng }) : Promise.resolve(null),
    hasLocation ? getWeather({ lat, lng }) : Promise.resolve(null),
    hasLocation ? getPollenForecast({ lat, lng }, 1) : Promise.resolve([]),
  ]);

  // Build briefing text
  const parts: string[] = [];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  parts.push(`${greeting}. Here's your air quality briefing.`);

  if (sensorReading?.aqi != null) {
    parts.push(
      `Your device last reported an AQI of ${sensorReading.aqi}. Its calibration is unverified.`,
    );
  }
  if (sensorReading?.temperature != null)
    parts.push(
      `The last recorded device temperature was ${sensorReading.temperature} degrees Celsius.`,
    );
  if (sensorReading?.capturedAt)
    parts.push(`Device capture time: ${sensorReading.capturedAt}.`);
  else if (sensorReading) parts.push("Device capture time is unknown.");
  if (!hasLocation)
    parts.push(
      "Environmental context is unavailable because no location was provided.",
    );

  const googleAqi = googleAq?.indexes?.[0];
  if (googleAqi) {
    parts.push(
      `The Google Air Quality index for the provided location is ${googleAqi.aqi}, rated ${googleAqi.category}.`,
    );
  }

  if (weather?.temperature) {
    parts.push(
      `Current temperature is ${Math.round(weather.temperature.degrees)} degrees${weather.humidity ? `, with ${weather.humidity.percent}% humidity` : ""}.`,
    );
  }

  const todayPollen = pollen?.[0]?.pollenTypeInfo;
  if (todayPollen?.length) {
    const active = todayPollen.filter((p) => p.inSeason);
    if (active.length > 0) {
      const levels = active
        .map((p) => `${p.displayName}: ${p.indexInfo?.category}`)
        .join(", ");
      parts.push(`Pollen levels today: ${levels}.`);
    }
  }

  parts.push("Have a great day.");

  const text = parts.join(" ");

  // If no ElevenLabs key, return text only
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ text, audio: null });
  }

  // Generate TTS
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      },
    );

    if (!ttsRes.ok) {
      return NextResponse.json({ text, audio: null, error: "TTS failed" });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      text,
      audio: `data:audio/mpeg;base64,${base64}`,
    });
  } catch {
    return NextResponse.json({ text, audio: null });
  }
}
