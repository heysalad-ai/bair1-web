import { usageGate } from "@/lib/usage-budget";
import { validCoordinates } from "@/lib/request-limits";
import { requireAuth } from "@/lib/auth";
import { withDeviceRead, accessibleDevice } from "@/lib/device-access";
import { NextRequest, NextResponse } from "next/server";
import { getLatestReading } from "@/lib/dynamo";
import { getAirQuality, getWeather, getPollenForecast } from "@/lib/google-env";
import { getAqiState } from "@/lib/aqi";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "51.4775");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "0.0656");

  if (
    deviceId &&
    !(await accessibleDevice({ kind: "user", user: auth.user }, deviceId))
  ) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }

  if (!validCoordinates(lat, lng))
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
    getAirQuality({ lat, lng }),
    getWeather({ lat, lng }),
    getPollenForecast({ lat, lng }, 1),
  ]);

  // Build briefing text
  const parts: string[] = [];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  parts.push(`${greeting}. Here's your air quality briefing.`);

  if (sensorReading?.aqi != null) {
    const state = getAqiState(sensorReading.aqi);
    parts.push(
      `Your sensor is reading an AQI of ${sensorReading.aqi}, which is ${state.level}. ${state.guidance[0]}.`,
    );
  }

  const googleAqi = googleAq?.indexes?.[0];
  if (googleAqi) {
    parts.push(
      `The Google Air Quality index for your area is ${googleAqi.aqi}, rated ${googleAqi.category}.`,
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
