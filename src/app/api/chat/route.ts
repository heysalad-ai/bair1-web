import { convertToModelMessages, streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getLatestReading, getReadingsInRange } from "@/lib/dynamo";
import { requireAuth } from "@/lib/auth";
import { accessibleDevice, accessibleDevices } from "@/lib/device-access";
import { getAirQuality, getWeather, getPollenForecast } from "@/lib/google-env";
import { GPT_5_6_MODEL } from "@/lib/openai";
import { getPublicFeedSnapshot } from "@/lib/public-feeds";

type ParticulateReading = {
  timestamp: string;
  pm1: number | null;
  pm25: number | null;
  pm10: number | null;
};

function summaryForMetric(readings: ParticulateReading[], metric: "pm1" | "pm25" | "pm10") {
  const samples = readings
    .filter((reading) => reading[metric] != null)
    .map((reading) => ({ time: new Date(reading.timestamp).getTime(), value: reading[metric] as number }));
  if (!samples.length) return null;

  const first = samples[0];
  const latest = samples.at(-1)!;
  const values = samples.map((sample) => sample.value);
  return {
    first: Number(first.value.toFixed(1)),
    latest: Number(latest.value.toFixed(1)),
    change: Number((latest.value - first.value).toFixed(1)),
    minimum: Number(Math.min(...values).toFixed(1)),
    maximum: Number(Math.max(...values).toFixed(1)),
    average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
    firstTimestamp: new Date(first.time).toISOString(),
    latestTimestamp: new Date(latest.time).toISOString(),
  };
}

function forecastPm25(readings: ParticulateReading[]) {
  const samples = readings
    .filter((reading) => reading.pm25 != null)
    .map((reading) => ({ time: new Date(reading.timestamp).getTime(), value: reading.pm25 as number }));
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
  const estimate = Math.max(0, yMean + slope * 30 * Math.exp(-1));

  return {
    pm25Now: Number(latest.value.toFixed(1)),
    pm25In30Minutes: Number(estimate.toFixed(1)),
    trendPerMinute: Number(slope.toFixed(3)),
    note: "Experimental 10-minute linear trend, damped over 30 minutes; it is not a measurement.",
  };
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const actor = { kind: "user" as const, user: auth.user };
  const { messages, feedContext } = await req.json();
  const pageContext = typeof feedContext === "string" ? feedContext.slice(0, 1_000) : "";
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai(GPT_5_6_MODEL),
    system: `You are Bair, an AI air quality assistant embedded in the Bair1 dashboard. You have access to real-time sensor data, Google environmental APIs (air quality, weather, pollen), and device information.

Be concise, friendly, and data-driven. When users ask about air quality, proactively fetch relevant data using your tools. Format numbers clearly and give actionable health advice.

When presenting AQI data:
- 0-50: Good (green) - safe for everyone
- 51-100: Moderate (yellow) - sensitive groups take care
- 101-150: Sensitive (orange) - reduce outdoor time
- 151-200: Unhealthy (red) - everyone reduce exertion
- 201-300: Very Unhealthy (purple) - avoid outdoors
- 301+: Hazardous (maroon) - stay indoors

Always cite whether data comes from "your sensor", "LAQN", or "Google Air Quality API". Use the public feed tool for questions that compare Bair1 with LAQN, ask what changed, or ask about the forecast. Never say that recent data is unavailable until that tool reports fewer than two readings.${pageContext ? `\n\nThe user is viewing this public feed context: ${pageContext}` : ""}`,
    messages: modelMessages,
    tools: {
      getSensorData: {
        description: "Get the latest reading from a specific sensor device",
        inputSchema: z.object({
          deviceId: z.string().describe("The sensor device ID"),
        }),
        execute: async ({ deviceId }: { deviceId: string }) => {
          if (!await accessibleDevice(actor, deviceId)) return { error: "device not found" };
          const reading = await getLatestReading(deviceId);
          if (!reading) return { error: "No data for this device" };
          return reading;
        },
      },
      getSensorHistory: {
        description: "Get sensor readings for a date range",
        inputSchema: z.object({
          deviceId: z.string(),
          hoursBack: z.number().default(24).describe("How many hours of history to fetch"),
        }),
        execute: async ({ deviceId, hoursBack }: { deviceId: string; hoursBack: number }) => {
          if (!await accessibleDevice(actor, deviceId)) return { error: "device not found" };
          hoursBack = Math.max(1, Math.min(24, hoursBack));
          const to = new Date().toISOString();
          const from = new Date(Date.now() - hoursBack * 3600000).toISOString();
          const readings = await getReadingsInRange(deviceId, from, to);
          if (readings.length === 0) return { error: "No readings in range" };
          const aqis = readings.map((r) => r.aqi).filter((value): value is number => value != null && Number.isFinite(value));
          return {
            count: readings.length,
            avgAqi: aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null,
            minAqi: aqis.length ? Math.min(...aqis) : null,
            maxAqi: aqis.length ? Math.max(...aqis) : null,
            latest: readings[0],
            oldest: readings[readings.length - 1],
          };
        },
      },
      getPublicFeedData: {
        description: "Get a fresh 30-minute Bair1 public feed analysis: latest sensors, first-to-latest PM changes, ranges, averages, experimental PM2.5 forecast, and LAQN comparison. Use for public feed, LAQN, change, trend, or forecast questions.",
        inputSchema: z.object({
          slug: z.string().default("kitchen").describe("Public feed slug, such as kitchen"),
        }),
        execute: async ({ slug }: { slug: string }) => {
          const now = new Date();
          const snapshot = await getPublicFeedSnapshot(slug, {
            limit: 240,
            from: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
            to: now.toISOString(),
            includeReferences: true,
          });
          if (!snapshot) return { error: "Public feed not found" };
          const laqn = snapshot.referenceReadings.at(-1);
          return {
            location: snapshot.location,
            updatedAt: snapshot.updatedAt,
            sensors: snapshot.devices.map((device) => {
              const readings = snapshot.readings.filter((reading) => reading.deviceId === device.deviceId);
              return {
                label: device.label,
                sensor: device.sensor,
                sampleCount: readings.length,
                pm1: summaryForMetric(readings, "pm1"),
                pm25: summaryForMetric(readings, "pm25"),
                pm10: summaryForMetric(readings, "pm10"),
                forecast: forecastPm25(readings),
              };
            }),
            laqn: laqn
              ? {
                  station: laqn.stationName,
                  timestamp: laqn.timestamp,
                  pm25: laqn.pm25,
                  pm10: laqn.pm10,
                  band: laqn.aqiBand,
                }
              : null,
          };
        },
      },
      listDevices: {
        description: "List all registered sensor devices",
        inputSchema: z.object({}),
        execute: async () => {
          const devices = await accessibleDevices(actor);
          return devices.map((d) => ({
            deviceId: d.deviceId,
            name: d.name,
            status: d.status,
          }));
        },
      },
      getGoogleAirQuality: {
        description: "Get Google Air Quality API data for a location (provides official AQI, pollutant concentrations, health recommendations)",
        inputSchema: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
        execute: async ({ lat, lng }: { lat: number; lng: number }) => {
          const data = await getAirQuality({ lat, lng });
          if (!data) return { error: "Google AQ API unavailable" };
          return data;
        },
      },
      getWeatherData: {
        description: "Get current weather conditions for a location",
        inputSchema: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
        execute: async ({ lat, lng }: { lat: number; lng: number }) => {
          const data = await getWeather({ lat, lng });
          if (!data) return { error: "Weather API unavailable" };
          return data;
        },
      },
      getPollenData: {
        description: "Get pollen forecast for a location (grass, tree, weed levels)",
        inputSchema: z.object({
          lat: z.number(),
          lng: z.number(),
        }),
        execute: async ({ lat, lng }: { lat: number; lng: number }) => {
          const data = await getPollenForecast({ lat, lng }, 3);
          if (!data.length) return { error: "Pollen API unavailable" };
          return data;
        },
      },
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
