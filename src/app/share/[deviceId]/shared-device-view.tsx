"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Logo from "@/components/Logo";
import type { SharedDeviceSnapshot } from "@/lib/shared-device";

function value(value: number | null | undefined, unit: string, digits = 1) {
  return value == null ? "—" : `${value.toFixed(digits)}${unit}`;
}

function relativeTime(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function SharedDeviceView({
  deviceId,
  token,
  initialSnapshot,
}: {
  deviceId: string;
  token: string;
  initialSnapshot: SharedDeviceSnapshot;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  useEffect(() => {
    const refresh = async () => {
      try {
      const response = await fetch(`/api/shared/devices/${encodeURIComponent(deviceId)}?token=${encodeURIComponent(token)}`);
      if (response.ok) { setSnapshot(await response.json()); setUnavailable(false); } else setUnavailable(true);
      } catch { setUnavailable(true); }
    };
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [deviceId, token]);

  const chart = useMemo(() => snapshot.history
    .filter((item) => item.temperature != null || item.humidity != null)
    .slice()
    .reverse()
    .map((item) => ({
      time: new Date(item.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      temperature: item.temperature,
      humidity: item.humidity,
    })), [snapshot.history]);
  const telemetry = snapshot.telemetry;

  if (unavailable) return <main className="m-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Shared view unavailable</h1><p className="mt-4">The link may have expired or been revoked, or the service may be offline. Ask the device owner for a current link.</p></main>;
  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-border bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Logo />
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Shared device view
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 lg:py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {snapshot.device.status === "active" ? "Device active" : snapshot.device.status}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{snapshot.device.name}</h1>
            <p className="mt-2 text-sm text-muted">Sensor {snapshot.device.deviceId.slice(-4)} · updated {telemetry ? relativeTime(telemetry.receivedAt) : "not yet"}</p>
          </div>
          <Link href="https://www.bair1.live" className="text-sm font-semibold text-primary hover:text-primary-hover">
            About Bair1 →
          </Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Temperature", value(telemetry?.temperature, "°C")],
            ["Humidity", value(telemetry?.humidity, "%")],
            ["Pressure", value(telemetry?.pressureUnit !== "hPa" ? null : telemetry.pressure, " hPa", 0)],
            ["Battery", value(telemetry?.batteryVoltage, " V", 2)],
          ].map(([label, metric]) => (
            <div key={label} className="rounded-2xl border border-border bg-surface p-5">
              <div className="text-xs uppercase tracking-[0.14em] text-muted">{label}</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{metric}</div>
            </div>
          ))}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="rounded-3xl border border-border bg-surface p-5 md:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Environmental trend</h2>
                <p className="mt-1 text-xs text-muted">Recent privacy-safe Notecard telemetry</p>
              </div>
              <span className="text-xs text-muted">Auto-refreshes</span>
            </div>
            {chart.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="sharedTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#62b550" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#62b550" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="4 4" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="temperature" stroke="#62b550" fill="url(#sharedTemp)" strokeWidth={2} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted">
                History will appear after the next device events.
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5 md:p-7">
            <h2 className="text-lg font-semibold">Air-quality stack</h2>
            {snapshot.airQuality ? (
              <div className="mt-6">
                <div className="text-6xl font-semibold text-primary">{snapshot.airQuality.aqi ?? "—"}</div>
                {snapshot.airQuality.aqi == null && <p className="text-sm text-muted">AQI unavailable — PM concentrations are not AQI scores.</p>}
                <div className="mt-2 text-sm text-muted">Current AQI</div>
                <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-bg p-3">PM2.5<br/><strong>{value(snapshot.airQuality.pm25, " µg/m³")}</strong></div>
                  <div className="rounded-xl bg-bg p-3">PM10<br/><strong>{value(snapshot.airQuality.pm10, " µg/m³")}</strong></div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-5">
                <div className="text-sm font-semibold text-accent">Particulate sensor pending</div>
                <p className="mt-2 text-sm leading-6 text-muted">The connectivity and environmental layers are live. AQI starts when a PM sensor sends PM2.5 or PM10 measurements.</p>
              </div>
            )}
            <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Location</dt><dd>{telemetry?.locationAvailable ? "Available privately" : "Waiting for fix"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Transport</dt><dd>{telemetry?.transport ?? "Notehub"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Latest event</dt><dd>{telemetry?.sourceFile ?? "—"}</dd></div>
            </dl>
          </section>
        </div>
        <p className="mt-8 text-center text-xs text-muted">Precise device location and account details are never included in shared views.</p>
      </div>
    </main>
  );
}
