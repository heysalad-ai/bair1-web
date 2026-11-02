"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Logo from "@/components/Logo";
import type { PublicFeedSnapshot } from "@/lib/public-feeds";
import AirInsightCard from "./AirInsightCard";
import LondonAirMap from "./LondonAirMap";
import LiveAirChat from "./LiveAirChat";
import { measurementFreshness, observationLabel } from "@/lib/measurement-contract";
import MultiSensorPanel from "./MultiSensorPanel";

type Props = {
  initialSnapshot: PublicFeedSnapshot;
};

function formatPm(value: number | null) {
  return value == null ? "--" : value.toFixed(0);
}

function formatTime(value: string | number | Date) {
  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function aqiLabel(pm25: number | null) {
  if (pm25 == null) return "Waiting";
  if (pm25 <= 9) return "Good";
  if (pm25 <= 35) return "Moderate";
  if (pm25 <= 55) return "Elevated";
  return "Poor";
}

type PmMetric = "pm1" | "pm25" | "pm10";

const pmMetricLabels: Record<PmMetric, string> = {
  pm1: "PM1",
  pm25: "PM2.5",
  pm10: "PM10",
};

const pmMetricStyles: Record<PmMetric, { dash?: string; width: number }> = {
  pm1: { dash: "2 5", width: 1.8 },
  pm25: { width: 2.6 },
  pm10: { dash: "7 4", width: 2 },
};

const pmMetrics = Object.keys(pmMetricLabels) as PmMetric[];
const referenceColor = "#f8fafc";
const forecastColor = "#c6ff4a";
const historyWindowMs = 30 * 60 * 1000;
const chartBucketMs = 15 * 1000;
const forecastStepMs = 5 * 60 * 1000;
const forecastHorizonMs = 30 * 60 * 1000;

type ForecastPoint = {
  time: number;
  pm25: number;
};

type ModelSeries = {
  history: ForecastPoint[];
  forecast: ForecastPoint[];
};

type PmSample = {
  time: number;
  value: number;
};

function fitTrend(samples: PmSample[], targetTime: number) {
  const xValues = samples.map((sample) => (sample.time - targetTime) / 60000);
  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const numerator = samples.reduce(
    (sum, sample, index) => sum + (xValues[index] - xMean) * (sample.value - yMean),
    0,
  );
  const denominator = xValues.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const slope = Math.max(-0.25, Math.min(0.25, denominator === 0 ? 0 : numerator / denominator));
  const intercept = yMean - slope * xMean;
  return { value: Math.max(0, intercept), slope };
}

function buildPm25ModelSeries(snapshot: PublicFeedSnapshot, deviceId: string | undefined): ModelSeries {
  if (!deviceId) return { history: [], forecast: [] };
  const samples = snapshot.readings
    .filter((reading) => reading.deviceId === deviceId && reading.pm25 != null)
    .map((reading) => ({ time: new Date(reading.timestamp).getTime(), value: reading.pm25 as number }))
    .sort((a, b) => a.time - b.time);
  if (samples.length < 4) return { history: [], forecast: [] };

  const latest = samples.at(-1)!;
  const modelHistoryStart = Math.max(samples[0].time + 5 * 60 * 1000, latest.time - 20 * 60 * 1000);
  const historyTimes = Array.from(
    { length: Math.max(0, Math.floor((latest.time - modelHistoryStart) / 60000)) },
    (_, index) => modelHistoryStart + index * 60000,
  );
  historyTimes.push(latest.time);

  const history = historyTimes.flatMap((time) => {
    const training = samples.filter((sample) => sample.time >= time - 10 * 60 * 1000 && sample.time <= time);
    if (training.length < 4) return [];
    return [{ time, pm25: fitTrend(training, time).value }];
  });

  const training = samples.filter((sample) => sample.time >= latest.time - 10 * 60 * 1000);
  const currentModel = fitTrend(training, latest.time);

  const forecast = Array.from({ length: forecastHorizonMs / forecastStepMs + 1 }, (_, index) => {
    const minutesAhead = (index * forecastStepMs) / 60000;
    const dampedTrend = currentModel.slope * minutesAhead * Math.exp(-minutesAhead / 30);
    return {
      time: latest.time + index * forecastStepMs,
      pm25: Math.max(0, currentModel.value + dampedTrend),
    };
  });

  return { history, forecast };
}

type TooltipPayloadItem = {
  name?: string;
  value?: number | string | null;
  color?: string;
  stroke?: string;
};

type TooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadItem[];
};

function PmTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const values = payload.filter((item) => item.value != null);
  if (!values.length) return null;
  return (
    <div className="min-w-56 border border-border bg-bg/95 p-3 shadow-xl backdrop-blur">
      <p className="mb-2 text-xs font-medium text-muted">{label == null ? "" : formatTime(label)}</p>
      <div className="space-y-1.5">
        {values.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color ?? item.stroke }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="font-medium text-ink">{Number(item.value).toFixed(1)} ug/m3</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PublicFeedClient({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeView, setActiveView] = useState<"live" | "map" | "studio">("live");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const now = Math.floor(Date.now() / 15_000) * 15_000;
      const params = new URLSearchParams({
        limit: "500",
        pollutant: "pm25",
        references: "true",
        from: new Date(now - historyWindowMs).toISOString(),
        to: new Date(now).toISOString(),
      });
      const response = await fetch(`/api/public/feeds/${snapshot.slug}?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as PublicFeedSnapshot;
      if (!cancelled) setSnapshot(next);
    };
    load().catch(() => {});
    const id = window.setInterval(() => {
      load().catch(() => {});
    }, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [snapshot.slug]);

  const referenceDeviceId = snapshot.devices[0]?.deviceId;
  const modelSeries = useMemo(
    () => buildPm25ModelSeries(snapshot, referenceDeviceId),
    [referenceDeviceId, snapshot],
  );
  const forecast = modelSeries.forecast;

  const chartData = useMemo(() => {
    const buckets = new Map<string, Record<string, string | number | null>>();
    for (const reading of snapshot.readings) {
      const bucketTime = Math.floor(new Date(reading.timestamp).getTime() / chartBucketMs) * chartBucketMs;
      const key = String(bucketTime);
      const row = buckets.get(key) ?? { time: bucketTime };
      row[`${reading.deviceId}:pm1`] = reading.pm1;
      row[`${reading.deviceId}:pm25`] = reading.pm25;
      row[`${reading.deviceId}:pm10`] = reading.pm10;
      buckets.set(key, row);
    }
    for (const point of modelSeries.history) {
      const bucketTime = Math.floor(point.time / chartBucketMs) * chartBucketMs;
      const key = String(bucketTime);
      const row = buckets.get(key) ?? { time: bucketTime };
      row["model:history"] = point.pm25;
      buckets.set(key, row);
    }
    for (const point of forecast) {
      const bucketTime = Math.floor(point.time / chartBucketMs) * chartBucketMs;
      const key = String(bucketTime);
      const row = buckets.get(key) ?? { time: bucketTime };
      row["forecast:pm25"] = point.pm25;
      buckets.set(key, row);
    }
    return [...buckets.values()].sort((a, b) => Number(a.time) - Number(b.time));
  }, [forecast, modelSeries.history, snapshot.readings]);

  const latestPm25Reading =
    snapshot.latest.find((reading) => reading.deviceId === referenceDeviceId && reading.pm25 != null) ??
    snapshot.latest.find((reading) => reading.pm25 != null);
  const latestPm25 = latestPm25Reading?.pm25 ?? null;
  const latestReference = snapshot.referenceReadings.at(-1);
  const forecastEnd = forecast.at(-1)?.pm25 ?? null;
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;
  const studioChartData = useMemo(
    () => chartData.map((point) => ({
      time: Number(point.time),
      sensorPm25: typeof point[`${referenceDeviceId}:pm25`] === "number" ? point[`${referenceDeviceId}:pm25`] as number : null,
      forecastPm25: typeof point["forecast:pm25"] === "number" ? point["forecast:pm25"] as number : null,
    })),
    [chartData, referenceDeviceId],
  );
  const studioSummary = useMemo(() => {
    const samples = snapshot.readings
      .filter((reading) => reading.deviceId === referenceDeviceId && reading.pm25 != null)
      .map((reading) => ({ time: new Date(reading.timestamp).getTime(), value: reading.pm25 as number }))
      .sort((a, b) => a.time - b.time);
    if (!samples.length) return null;

    const first = samples[0];
    const latest = samples.at(-1)!;
    const values = samples.map((sample) => sample.value);
    return {
      current: latest.value,
      change: latest.value - first.value,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      sampleCount: samples.length,
      from: first.time,
      updatedAt: latest.time,
    };
  }, [referenceDeviceId, snapshot.readings]);

  return (
    <main className="min-h-screen bg-bg font-mono text-ink">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden border-l border-border pl-4 text-xs text-muted sm:inline">Public air monitor</span>
          </div>
          <div className="flex flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:gap-5">
            <span className="inline-flex items-center gap-2 text-ink">
              {measurementFreshness(snapshot.latest[0]?.capturedAt || snapshot.latest[0]?.timestamp, now)} measurements
            </span>
            <span>{snapshot.location}</span>
            <span>Measured {observationLabel(snapshot.latest[0]?.capturedAt || snapshot.latest[0]?.timestamp, now)}</span>
            <Link href="/docs" className="hidden transition hover:text-ink md:inline">Docs</Link>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="h-9 w-full border border-border bg-bg px-4 text-ink transition hover:border-primary sm:w-auto"
            >
              Copy share link
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-[1600px] flex-col px-3 sm:px-6 lg:px-8">

        <div className="flex overflow-x-auto border-b border-border" role="tablist" aria-label="Live data view">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "live"}
            onClick={() => setActiveView("live")}
            className={`-mb-px h-12 shrink-0 border-b-2 px-5 text-sm transition ${activeView === "live" ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            Live air
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "map"}
            onClick={() => setActiveView("map")}
            className={`-mb-px h-12 shrink-0 border-b-2 px-5 text-sm transition ${activeView === "map" ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            London map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "studio"}
            onClick={() => setActiveView("studio")}
            className={`-mb-px h-12 shrink-0 border-b-2 px-5 text-sm transition ${activeView === "studio" ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            Data Studio
          </button>
        </div>

        <div className="py-4 sm:py-5">
        {activeView === "live" ? (
          <>
            <section className="border border-border bg-surface">
          <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold">PM history and forecast</h2>
              <p className="mt-1 text-xs text-muted">30 minutes measured · 30 minutes predicted</p>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs text-muted sm:flex sm:flex-wrap sm:gap-3 sm:text-sm">
              {snapshot.devices.map((device) => (
                <span key={device.deviceId} className="inline-flex min-w-0 items-center gap-2">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: device.color }} />
                  <span className="truncate">{device.label}</span>
                  <span className="shrink-0 text-muted/70">PM1 / PM2.5 / PM10</span>
                </span>
              ))}
              {snapshot.referenceReadings.length > 0 ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/40" style={{ background: referenceColor }} />
                  <span className="truncate">LAQN latest hourly</span>
                  <span className="shrink-0 text-muted/70">
                    PM2.5 {formatPm(latestReference?.pm25 ?? null)} / PM10 {formatPm(latestReference?.pm10 ?? null)}
                  </span>
                </span>
              ) : null}
              {forecast.length > 0 ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: forecastColor }} />
                  <span className="truncate">Rolling model history → forecast</span>
                  <span className="shrink-0 text-muted/70">PM2.5 · experimental</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 p-2 sm:p-4">
            <div className="h-[320px] min-w-0 sm:h-[420px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 350, height: 320 }}
              >
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatTime}
                    minTickGap={28}
                    tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 11 }}
                    tickMargin={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, "dataMax + 4"]}
                    label={{
                      value: "ug/m3",
                      angle: -90,
                      position: "insideLeft",
                      fill: "rgba(255,255,255,0.5)",
                      fontSize: 11,
                    }}
                    tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 11 }}
                    width={46}
                  />
                  <ReferenceLine y={9} stroke="rgba(57,158,32,0.55)" strokeDasharray="4 4" />
                  <ReferenceLine y={15} stroke="rgba(245,158,11,0.5)" strokeDasharray="4 4" />
                  {latestReference?.pm25 != null ? (
                    <ReferenceLine
                      y={latestReference.pm25}
                      stroke={referenceColor}
                      strokeDasharray="5 4"
                      strokeWidth={1.6}
                    />
                  ) : null}
                  {latestReference?.pm10 != null ? (
                    <ReferenceLine
                      y={latestReference.pm10}
                      stroke={referenceColor}
                      strokeDasharray="10 5"
                      strokeWidth={1.4}
                    />
                  ) : null}
                  {forecast[0] && forecast.at(-1) ? (
                    <ReferenceArea
                      x1={forecast[0].time}
                      x2={forecast.at(-1)!.time}
                      fill={forecastColor}
                      fillOpacity={0.025}
                      strokeOpacity={0}
                    />
                  ) : null}
                  {forecast[0] ? (
                    <ReferenceLine
                      x={forecast[0].time}
                      stroke="rgba(198,255,74,0.35)"
                      strokeDasharray="2 4"
                    />
                  ) : null}
                  <Tooltip
                    cursor={{ stroke: "rgba(255,255,255,0.32)", strokeWidth: 1 }}
                    content={<PmTooltip />}
                  />
                  {snapshot.devices.flatMap((device) =>
                    pmMetrics.map((metric) => (
                        <Line
                          key={`${device.deviceId}:${metric}`}
                          type="monotone"
                          dataKey={`${device.deviceId}:${metric}`}
                          name={`${device.label} ${pmMetricLabels[metric]}`}
                          stroke={device.color}
                          strokeDasharray={pmMetricStyles[metric].dash}
                          strokeWidth={pmMetricStyles[metric].width}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )),
                    )}
                  <Line
                    type="monotone"
                    dataKey="model:history"
                    name="Rolling model history PM2.5"
                    stroke={forecastColor}
                    strokeWidth={2.2}
                    strokeOpacity={0.76}
                    dot={{ r: 1.8, fill: forecastColor, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast:pm25"
                    name="Bair1 model forecast PM2.5"
                    stroke={forecastColor}
                    strokeDasharray="4 5"
                    strokeWidth={2.4}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
            </section>

            <section className="mt-3 grid gap-px border border-border bg-border md:grid-cols-3">
              <div className="bg-surface p-4">
                <p className="text-sm text-muted">Current PM2.5</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-semibold">{formatPm(latestPm25)}</span>
                  <span className="pb-2 text-sm text-muted">ug/m3</span>
                </div>
                <p className="mt-2 text-sm text-primary">{aqiLabel(latestPm25)}</p>
              </div>
              <div className="bg-surface p-4">
                <p className="text-sm text-muted">Forecast PM2.5 · +30 min</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-semibold text-[#c6ff4a]">{formatPm(forecastEnd)}</span>
                  <span className="pb-2 text-sm text-muted">ug/m3</span>
                </div>
                <p className="mt-2 text-xs text-muted">Trend model · experimental</p>
              </div>
              {latestPm25Reading ? (
                <article className="bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{latestPm25Reading.label}</p>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: latestPm25Reading.color }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{latestPm25Reading.sensor}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-muted">PM1</p><p className="text-lg font-semibold">{formatPm(latestPm25Reading.pm1)}</p></div>
                    <div><p className="text-muted">PM2.5</p><p className="text-lg font-semibold">{formatPm(latestPm25Reading.pm25)}</p></div>
                    <div><p className="text-muted">PM10</p><p className="text-lg font-semibold">{formatPm(latestPm25Reading.pm10)}</p></div>
                  </div>
                  <p className="mt-3 text-xs text-muted">{formatTime(latestPm25Reading.timestamp)}</p>
                </article>
              ) : <div className="bg-surface p-4 text-sm text-muted">Waiting for a sensor reading.</div>}
            </section>

            <MultiSensorPanel snapshot={snapshot} />

            <div className="mt-8">
              <AirInsightCard slug={snapshot.slug} />
            </div>


          </>
        ) : activeView === "map" ? (
          <LondonAirMap
            stations={snapshot.referenceStations}
            bair1Point={{
              id: "bair1-reference",
              label: `Bair1 · ${snapshot.referenceLocation.label}`,
              lat: snapshot.referenceLocation.lat,
              lng: snapshot.referenceLocation.lng,
              pm25: latestPm25,
              timestamp: latestPm25Reading?.timestamp ?? null,
            }}
          />
        ) : (
          <LiveAirChat
            feedName={snapshot.title || "Bair1 live air feed"}
            location={snapshot.location}
            deviceIds={snapshot.devices.map((device) => device.deviceId)}
            chartData={studioChartData}
            summary={studioSummary}
          />
        )}
        </div>
      </section>
    </main>
  );
}
