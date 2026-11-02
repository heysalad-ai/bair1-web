"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";

export type NotecardTelemetryPoint = {
  capturedAt: string;
  receivedAt: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  pressureUnit?: string;
  batteryVoltage: number | null;
  motion: number | null;
  deviceStatus: string | null;
  transport: string | null;
  locationAvailable: boolean;
  locationSource: string | null;
  sourceFile: string | null;
  updatedAt: string;
};

function metric(value: number | null, unit: string, digits = 1) {
  return value == null ? "—" : `${value.toFixed(digits)}${unit}`;
}

function eventLabel(file: string | null) {
  if (!file) return "Device event";
  if (file.includes("track")) return "Environmental track";
  if (file.includes("temp")) return "Temperature sample";
  if (file.includes("session")) return "Sync session";
  if (file.includes("geolocate")) return "Location update";
  if (file.includes("test")) return "Pipeline test";
  return file;
}

export default function NotecardOverview({
  deviceId,
  deviceName,
  telemetry,
  history,
  lastUpdatedText,
}: {
  deviceId: string;
  deviceName: string;
  telemetry: NotecardTelemetryPoint;
  history: NotecardTelemetryPoint[];
  lastUpdatedText: string;
}) {
  const authenticatedFetch = useAuthenticatedFetch();
  const [shareState, setShareState] = useState<"idle" | "working" | "copied" | "error">("idle");
  const chart = useMemo(() => history
    .filter((point) => point.temperature != null || point.humidity != null)
    .slice()
    .reverse()
    .map((point) => ({
      time: new Date(point.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      temperature: point.temperature,
      humidity: point.humidity,
    })), [history]);

  const share = async () => {
    setShareState("working");
    try {
      const response = await authenticatedFetch(`/api/devices/${encodeURIComponent(deviceId)}/share`, { method: "POST" });
      if (!response.ok) throw new Error("share failed");
      const result = await response.json();
      await navigator.clipboard.writeText(result.url);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("error");
    }
  };

  const recentEvents = history.slice(0, 5);

  return (
    <section className="w-full overflow-hidden rounded-[28px] border border-primary/25 bg-gradient-to-b from-primary/10 via-surface to-surface shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
      <div className="border-b border-border/80 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_var(--color-primary)]" />
              Notecard live telemetry
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{deviceName}</h2>
            <p className="mt-1 text-xs text-muted">Sensor {deviceId.slice(-4)} · received {lastUpdatedText}</p>
          </div>
          <button
            onClick={() => void share()}
            disabled={shareState === "working"}
            className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          >
            {shareState === "working" ? "Creating link…" : shareState === "copied" ? "Link copied" : shareState === "error" ? "Try sharing again" : "Share live view"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/70 sm:grid-cols-4">
        {[
          ["Temperature", metric(telemetry.temperature, "°C")],
          ["Humidity", metric(telemetry.humidity, "%")],
          ["Pressure", metric(telemetry.pressureUnit !== "hPa" ? null : telemetry.pressure, " hPa", 0)],
          ["Battery", metric(telemetry.batteryVoltage, " V", 2)],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface/95 px-4 py-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">{label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink">Environmental trend</h3>
              <p className="mt-1 text-[11px] text-muted">Real Notecard samples, retained for 90 days</p>
            </div>
            <span className="rounded-full bg-bg px-2.5 py-1 text-[10px] text-muted">{history.length} events</span>
          </div>
          {chart.length ? (
            <div className="h-52 rounded-2xl border border-border bg-bg/45 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="notecardTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#62b550" stopOpacity={0.36} />
                      <stop offset="95%" stopColor="#62b550" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "var(--color-muted)" }} minTickGap={28} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--color-muted)" }} width={28} />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} />
                  <Area type="monotone" dataKey="temperature" stroke="#62b550" fill="url(#notecardTemp)" strokeWidth={2} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-border bg-bg/35 px-6 text-center text-xs leading-5 text-muted">
              History starts with the next device event. Existing live telemetry is preserved above.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
            <div className="text-xs font-semibold text-accent">Air-quality layer ready</div>
            <p className="mt-2 text-xs leading-5 text-muted">Particulate measurements appear when the host sensor sends PM2.5 or PM10. AQI remains unavailable until a calculated AQI is supplied; PM concentrations alone are not AQI scores.</p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/40 p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Pipeline health</div>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between"><span className="text-muted">Notecard</span><span className="font-medium text-primary">Connected</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Notehub route</span><span className="font-medium text-primary">Delivering</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Location</span><span className="font-medium text-ink">{telemetry.locationAvailable ? "Private fix available" : "Waiting for fix"}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Transport</span><span className="font-medium text-ink">{telemetry.transport ?? "Notehub"}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4 sm:px-6">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Recent device activity</div>
        {recentEvents.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {recentEvents.map((event, index) => (
              <div key={`${event.capturedAt}-${event.sourceFile}-${index}`} className="flex items-center justify-between rounded-xl bg-bg/40 px-3 py-2.5 text-xs">
                <span className="text-ink/85">{eventLabel(event.sourceFile)}</span>
                <span className="text-muted">{new Date(event.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Waiting for the first historical event.</p>
        )}
      </div>
    </section>
  );
}
