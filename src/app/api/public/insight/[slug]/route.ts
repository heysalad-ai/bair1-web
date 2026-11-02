import { reserveUsage, UsageBudgetError } from "@/lib/usage-budget";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPollenForecast, getWeather } from "@/lib/google-env";
import { GPT_5_6_MODEL } from "@/lib/openai";
import { getPublicFeedSnapshot, PUBLIC_FEEDS, type PublicFeedSnapshot } from "@/lib/public-feeds";

const INSIGHT_CACHE_SECONDS = 120;
const HISTORY_WINDOW_MS = 30 * 60 * 1000;
const FORECAST_HORIZON_MINUTES = 30;

const insightSchema = z.object({
  headline: z.string().min(1).max(180),
  explanation: z.string().min(1).max(900),
  advice: z.array(z.string().min(1).max(240)).min(1).max(3),
  confidence: z.enum(["low", "medium", "high"]),
});

type Insight = z.infer<typeof insightSchema>;
type CachedInsight = {
  expiresAt: number;
  value: Promise<Insight | null>;
};

const insightCache = new Map<string, CachedInsight>();

function sensorHistory(snapshot: PublicFeedSnapshot) {
  return snapshot.devices.map((device) => {
    const samples = snapshot.readings
      .filter((reading) => reading.deviceId === device.deviceId && reading.pm25 != null)
      .map((reading) => reading.pm25 as number);
    const first = samples.at(0);
    const latest = samples.at(-1);

    return {
      label: device.label,
      sensor: device.sensor,
      sampleCount: samples.length,
      pm25: {
        first: first == null ? null : Number(first.toFixed(1)),
        latest: latest == null ? null : Number(latest.toFixed(1)),
        min: samples.length ? Number(Math.min(...samples).toFixed(1)) : null,
        max: samples.length ? Number(Math.max(...samples).toFixed(1)) : null,
        average: samples.length
          ? Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(1))
          : null,
      },
    };
  });
}

function forecastPm25(snapshot: PublicFeedSnapshot) {
  const device = snapshot.devices[0];
  if (!device) return null;

  const samples = snapshot.readings
    .filter((reading) => reading.deviceId === device.deviceId && reading.pm25 != null)
    .map((reading) => ({
      time: new Date(reading.timestamp).getTime(),
      value: reading.pm25 as number,
    }))
    .sort((a, b) => a.time - b.time);
  if (samples.length < 4) return null;

  const latest = samples.at(-1)!;
  const training = samples.filter((sample) => sample.time >= latest.time - 10 * 60 * 1000);
  if (training.length < 4) return null;

  const xValues = training.map((sample) => (sample.time - latest.time) / 60000);
  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = training.reduce((sum, sample) => sum + sample.value, 0) / training.length;
  const numerator = training.reduce(
    (sum, sample, index) => sum + (xValues[index] - xMean) * (sample.value - yMean),
    0,
  );
  const denominator = xValues.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const slope = Math.max(-0.25, Math.min(0.25, denominator === 0 ? 0 : numerator / denominator));
  const dampedTrend = slope * FORECAST_HORIZON_MINUTES * Math.exp(-FORECAST_HORIZON_MINUTES / 30);

  return {
    device: device.label,
    pm25Now: Number(latest.value.toFixed(1)),
    pm25In30Minutes: Number(Math.max(0, yMean + dampedTrend).toFixed(1)),
    trendPerMinute: Number(slope.toFixed(3)),
    method: "same 10-minute linear, damped client-side trend model shown on this feed",
  };
}

function pollenSummary(awaitedPollen: Awaited<ReturnType<typeof getPollenForecast>>) {
  const today = awaitedPollen[0];
  if (!today?.pollenTypeInfo?.length) return null;

  return today.pollenTypeInfo.flatMap((pollen) => {
    if (!pollen.indexInfo) return [];
    return [{
      type: pollen.displayName,
      level: pollen.indexInfo.category,
      index: pollen.indexInfo.value,
      inSeason: pollen.inSeason,
    }];
  });
}

async function createInsight(slug: string): Promise<Insight | null> {
  const feed = PUBLIC_FEEDS[slug];
  if (!feed) return null;

  const now = new Date();
  const snapshot = await getPublicFeedSnapshot(slug, {
    limit: 500,
    from: new Date(now.getTime() - HISTORY_WINDOW_MS).toISOString(),
    to: now.toISOString(),
    includeReferences: true,
  });
  if (!snapshot) return null;

  const [weather, pollen] = await Promise.all([
    getWeather(feed.referenceLocation).catch(() => null),
    getPollenForecast(feed.referenceLocation, 1).catch(() => []),
  ]);
  const laqn = snapshot.referenceReadings.at(-1);
  const readings = snapshot.latest.map((reading) => ({
    label: reading.label,
    sensor: reading.sensor,
    timestamp: reading.timestamp,
    pm1: reading.pm1,
    pm25: reading.pm25,
    pm10: reading.pm10,
  }));
  const context = {
    feed: { location: snapshot.location, updatedAt: snapshot.updatedAt },
    latestSensorReadings: readings,
    recentThirtyMinuteHistory: sensorHistory(snapshot),
    thirtyMinuteTrendForecast: forecastPm25(snapshot),
    laqnComparison: laqn
      ? {
          station: laqn.stationName,
          timestamp: laqn.timestamp,
          pm25: laqn.pm25,
          pm10: laqn.pm10,
          no2: laqn.no2,
          ozone: laqn.ozone,
          band: laqn.aqiBand,
        }
      : null,
    weather: weather
      ? {
          description: weather.weatherCondition?.description?.text ?? null,
          temperature: weather.temperature?.degrees ?? null,
          humidity: weather.humidity?.percent ?? null,
          wind: weather.wind?.speed
            ? `${weather.wind.speed.value} ${weather.wind.speed.unit} ${weather.wind.direction.cardinal}`
            : null,
        }
      : null,
    pollen: pollenSummary(pollen),
  };

  const result = await generateObject({
    model: openai(GPT_5_6_MODEL),
    maxOutputTokens: 1000, maxRetries: 0, timeout: 30000,
    schema: insightSchema,
    schemaName: "air_quality_insight",
    system: `You are Bair1's public Air Insight analyst. Write for a non-technical person, using only the supplied data. Your output must be a concise, factual JSON object matching the schema.

Ground the explanation in actual supplied PM values: when PM data exists, include at least one value with its unit (µg/m³). Distinguish indoor Bair1 sensor data from LAQN's outdoor hourly reference. Explain the 30-minute trend forecast as a model, not a measurement. Give 1-3 concrete actions only when supported by the readings or trend; avoid generic health-blog wording, diagnoses, or unsupported claims. If readings conflict, say so. Use lower confidence for sparse, stale, or inconsistent data.`,
    prompt: `Create an air insight from this live feed context:\n${JSON.stringify(context)}`,
  });

  return result.object;
}

async function getCachedInsight(slug: string) {
  const cached = insightCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = reserveUsage("insight", slug).then(() => createInsight(slug));
  insightCache.set(slug, {
    value,
    expiresAt: Date.now() + INSIGHT_CACHE_SECONDS * 1000,
  });

  try {
    return await value;
  } catch (error) {
    insightCache.delete(slug);
    throw error;
  }
}

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!PUBLIC_FEEDS[slug]) {
    return NextResponse.json({ error: "feed not found" }, { status: 404 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Air Insight is unavailable" }, { status: 503 });
  }

  try {
    const insight = await getCachedInsight(slug);
    if (!insight) {
      return NextResponse.json({ error: "Air Insight is unavailable" }, { status: 503 });
    }

    return NextResponse.json(insight, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UsageBudgetError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Air Insight generation failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Air Insight is temporarily unavailable" }, { status: 503 });
  }
}
