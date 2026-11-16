"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, type KeyboardEvent } from "react";
import BearCompanion from "@/components/bear/BearCompanion";
import StateMessage from "@/components/ui/StateMessage";
import {
  Button,
  Icon,
  IconButton,
  Segmented,
  Skeleton,
  StatusIndicator,
} from "@/components/ui/kit";
import { deviceBearState } from "@/lib/bear-state";
import {
  dashboardHref,
  deviceOverview,
  type DeviceSnapshot,
} from "@/lib/device-overview";
import { toneFromFreshness, type UnitTone } from "@/lib/fleet-insights";
import {
  historySeries,
  measurementFields,
  observationLabel,
} from "@/lib/measurement-contract";
import { readingSummary, windowChange } from "@/lib/reading-summary";
import { formatValue, snapshotMetrics } from "@/lib/snapshot-metrics";
import { deviceSpokenSummary } from "@/lib/spoken-summary";
import TrendChart, { formatRecorded, Sparkline } from "./TrendChart";
import LocationCard from "./LocationCard";

export type Row = Record<string, string | number | null>;
export type HistoryState = {
  rows: Row[];
  busy: boolean;
  error: string;
  more: boolean;
  fetchedAt: number | null;
};
export type DetailDevice = {
  deviceId: string;
  name: string;
  lat: number | null;
  lng: number | null;
};
export type SnapshotState =
  | { status: "loading" }
  | { status: "ready"; snapshot: DeviceSnapshot }
  | { status: "error" | "denied"; message: string };

export const WINDOWS = [
  { value: 0, label: "Latest 200", long: "Latest 200 stored readings" },
  { value: 24, label: "24 h", long: "Last 24 hours" },
  { value: 168, label: "7 days", long: "Last 7 days" },
  { value: 336, label: "14 days", long: "Last 14 days" },
];

export function snapshotTone(state: SnapshotState, now: number): UnitTone {
  if (state.status === "loading") return "loading";
  if (state.status !== "ready") return "error";
  return toneFromFreshness(deviceOverview(state.snapshot, now).freshness);
}

export default function DeviceDetailView({
  device,
  snapshotState,
  onRetrySnapshot,
  history,
  windowHours,
  onWindow,
  onRefreshHistory,
  field,
  onField,
  now,
  newReading,
}: {
  device: DetailDevice;
  snapshotState: SnapshotState;
  onRetrySnapshot: () => void;
  history: HistoryState;
  windowHours: number;
  onWindow: (hours: number) => void;
  onRefreshHistory: () => void;
  field: string;
  onField: (field: string) => void;
  now: number;
  newReading: boolean;
}) {
  const snapshot = snapshotState.status === "ready" ? snapshotState.snapshot : null;
  const latest = snapshotMetrics(snapshot);
  const overview = snapshot ? deviceOverview(snapshot, now) : null;
  const tone = snapshotTone(snapshotState, now);
  const windowInfo = WINDOWS.find((w) => w.value === windowHours) ?? WINDOWS[0];

  // Measurements the unit actually reports: latest snapshot ∪ loaded history.
  const available = measurementFields.filter(
    (item) =>
      latest.some((m) => m.field === item.field) ||
      history.rows.some(
        (row) => typeof row[item.field] === "number" && Number.isFinite(row[item.field] as number),
      ),
  );
  const metric = available.find((item) => item.field === field) ?? available[0];
  const series = metric ? historySeries(history.rows, metric.field) : [];
  const stats = metric ? readingSummary(history.rows, metric.field) : null;
  const change = windowChange(series);
  const latestForMetric = latest.find((m) => m.field === metric?.field);
  const bear = deviceBearState({
    loading: snapshotState.status === "loading",
    tone,
    denied: snapshotState.status === "denied",
    failed: snapshotState.status === "error",
    newReading,
  });
  const summary =
    snapshot && metric
      ? deviceSpokenSummary({
          name: device.name,
          metric,
          latest: latestForMetric?.value,
          age: latestForMetric?.capturedAt ? observationLabel(latestForMetric.capturedAt, now) : undefined,
          status: overview?.status ?? "Unknown",
          stats,
          windowLabel: windowInfo.long,
          partial: history.more,
        })
      : undefined;

  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onTileKey(event: KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + available.length) % available.length;
    onField(available[next].field);
    tileRefs.current[next]?.focus();
  }

  if (snapshotState.status === "error" || snapshotState.status === "denied")
    return (
      <StateMessage
        kind={snapshotState.status === "denied" ? "denied" : "error"}
        title={snapshotState.status === "denied" ? "Access unavailable" : "Readings unavailable"}
        actions={
          <>
            <Button onClick={onRetrySnapshot} icon={Icon.refresh}>
              {snapshotState.status === "denied" ? "Refresh devices" : "Try again"}
            </Button>
            <Link className="b1-btn" data-variant="ghost" href="/dashboard">
              All units
            </Link>
          </>
        }
      >
        <p>{snapshotState.message}</p>
      </StateMessage>
    );

  return (
    <div className="b1-page">
      <div className="b1-bear-strip">
        <BearCompanion mood={bear.mood} message={bear.message} summary={summary} size={64} />
      </div>

      {/* Latest readings select the graph's measurement; graph follows immediately. */}
      <section className="b1-card b1-card-pad" aria-labelledby="trend-title" aria-busy={history.busy}>
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="latest-title" className="b1-eyebrow">
              Latest readings
            </h2>
            <span className="text-xs text-[var(--b1-muted)]">
              {overview ? `Captured ${overview.age.toLowerCase()}` : "Loading…"}
            </span>
          </div>
          {snapshotState.status === "loading" ? (
            <div className="b1-tiles" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="b1-tile">
                  <Skeleton width="3rem" height="0.75rem" />
                  <Skeleton width="4.5rem" height="1.4rem" />
                  <Skeleton width="100%" height="1.6rem" />
                </div>
              ))}
            </div>
          ) : !available.length ? (
            <StateMessage kind="empty" title="No measurements yet" headingLevel={3}>
              <p>This unit is registered but hasn’t stored a measurement. Nothing has been filled in.</p>
            </StateMessage>
          ) : (
            <div className="b1-tiles" role="radiogroup" aria-label="Measurement shown in the graph">
              {available.map((item, index) => {
                const value = latest.find((m) => m.field === item.field);
                const selected = item.field === metric?.field;
                return (
                  <button
                    key={item.field}
                    ref={(node) => {
                      tileRefs.current[index] = node;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    className="b1-tile"
                    onClick={() => onField(item.field)}
                    onKeyDown={(event) => onTileKey(event, index)}
                  >
                    <span className="b1-tile-label">{item.label}</span>
                    <span className="b1-tile-value">
                      {formatValue(value?.value, item.digits)}
                      <small>{item.unit}</small>
                    </span>
                    <span className="block h-6 w-full">
                      <Sparkline series={historySeries(history.rows, item.field)} />
                    </span>
                    <span className="b1-tile-note">
                      {!value
                        ? "Not in latest reading"
                        : value.unconfirmed
                          ? "Unit unconfirmed"
                          : value.capturedAt
                            ? observationLabel(value.capturedAt, now)
                            : "Capture time unknown"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="b1-chart-head mt-6 border-t border-[var(--b1-line)] pt-5">
          <div className="min-w-0">
            <h2 id="trend-title" className="b1-h2">
              {metric ? `${metric.label} over time` : "Readings over time"}
            </h2>
            <p className="b1-sub mt-1">
              {metric ? `${metric.unit} · ` : ""}Times in UTC ·{" "}
              {history.rows.length
                ? `${history.rows.length} records loaded${stats ? `, ${stats.count} with ${metric?.label}` : ""}`
                : history.busy
                  ? "Loading stored readings…"
                  : "No records in this window"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Time window"
              value={windowHours}
              onChange={onWindow}
              options={WINDOWS.map((w) => ({ value: w.value, label: w.label, title: w.long }))}
            />
            <IconButton
              label={history.busy ? "Loading graph" : "Refresh graph"}
              icon={<span className={history.busy ? "b1-spin inline-flex" : "inline-flex"}>{Icon.refresh}</span>}
              disabled={history.busy}
              onClick={onRefreshHistory}
            />
          </div>
        </div>

        {history.more && !history.error && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--b1-bg)] px-3 py-1.5 text-xs text-[var(--b1-ink-2)]">
            <StatusIndicator tone="delayed" label="" />
            Partial history — only the newest 200 records in this window are shown.{" "}
            <Link className="underline underline-offset-2" href={dashboardHref(device.deviceId, "analytics")}>
              Open full history
            </Link>
          </p>
        )}

        <div
          className="b1-chart"
          role="region"
          aria-label={
            metric && stats
              ? `${metric.label} graph, ${windowInfo.long.toLowerCase()}. ${stats.count} readings from ${stats.minimum.toFixed(metric.digits)} to ${stats.maximum.toFixed(metric.digits)} ${metric.unit}. The plotted values are in the table below.`
              : "Readings graph"
          }
        >
          {history.error ? (
            <div className="grid h-full place-items-center text-center" role="alert">
              <div>
                <p className="text-[var(--b1-ink-2)]">{history.error}</p>
                <Button className="mt-3" icon={Icon.refresh} onClick={onRefreshHistory}>
                  Try again
                </Button>
              </div>
            </div>
          ) : !stats || !metric ? (
            history.busy ? (
              <Skeleton width="100%" height="100%" className="rounded-xl" />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center">
                <p className="max-w-md text-sm text-[var(--b1-muted)]">
                  No {metric?.label ?? "numeric"} readings in the {windowInfo.long.toLowerCase()}.{" "}
                  {windowHours ? "Try “Latest 200” to see the most recent stored readings." : "Readings will appear here once stored."}
                </p>
              </div>
            )
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${metric.field}-${windowHours}`}
                className="h-full"
                initial={{ opacity: 0.35 }}
                animate={{ opacity: history.busy ? 0.6 : 1 }}
                exit={{ opacity: 0.35 }}
                transition={{ duration: 0.18 }}
              >
                <TrendChart series={series} metric={metric} average={stats.average} />
              </motion.div>
            </AnimatePresence>
          )}
          <AnimatePresence>
            {newReading && (
              <motion.span
                className="b1-new-badge absolute right-3 top-3"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                New reading
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {metric && stats && !history.error && (
          <>
            <dl className="b1-stats">
              <Stat label="Lowest" value={stats.minimum} metric={metric} />
              <Stat label="Average per reading" value={stats.average} metric={metric} />
              <Stat label="Highest" value={stats.maximum} metric={metric} />
              <div className="b1-stat">
                <dt>First → latest in window</dt>
                <dd>
                  {change ? (
                    <>
                      {change.delta > 0 ? "+" : change.delta < 0 ? "−" : "±"}
                      {Math.abs(change.delta).toFixed(metric.digits)}
                      <small>{metric.unit}</small>
                    </>
                  ) : (
                    <span className="text-sm font-normal text-[var(--b1-muted)]">Needs 2+ readings</span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-[var(--b1-muted)]">
              From {stats.count} loaded readings{history.more ? " (partial)" : ""}. The average is per reading, not weighted by time.
              Line breaks mark missing values or gaps over five minutes; each dot is a stored reading.
              {history.fetchedAt
                ? ` Fetched ${new Date(history.fetchedAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC — fetch time, not capture time.`
                : ""}
            </p>
            <details className="b1-details mt-4">
              <summary>View plotted readings ({stats.count})</summary>
              <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-[var(--b1-line)]">
                <table className="b1-table">
                  <caption className="b1-sr">
                    {metric.label} readings, {windowInfo.long.toLowerCase()}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Recorded (UTC)</th>
                      <th scope="col">
                        {metric.label} ({metric.unit})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {series
                      .filter((point) => point.value !== null)
                      .reverse()
                      .map((point) => (
                        <tr key={point.time}>
                          <td>{formatRecorded(point.time)}</td>
                          <td>{(point.value as number).toFixed(metric.digits)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      <div className="b1-two-col">
        <LocationCard lat={device.lat} lng={device.lng} reading={snapshot?.reading ?? null} />
        <ReadingDetails device={device} snapshot={snapshot} now={now} reported={latest.map((m) => m.field)} />
      </div>
    </div>
  );
}

function Stat({ label, value, metric }: { label: string; value: number; metric: { digits: number; unit: string } }) {
  return (
    <div className="b1-stat">
      <dt>{label}</dt>
      <dd>
        {value.toFixed(metric.digits)}
        <small>{metric.unit}</small>
      </dd>
    </div>
  );
}

function ReadingDetails({
  device,
  snapshot,
  now,
  reported,
}: {
  device: DetailDevice;
  snapshot: DeviceSnapshot | null;
  now: number;
  reported: string[];
}) {
  const reading = snapshot?.reading ?? null;
  const telemetry = snapshot?.telemetry ?? null;
  const capture = (reading?.capturedAt || telemetry?.measurementAt) as string | null | undefined;
  const receipt = (reading?.receivedAt || telemetry?.receivedAt) as string | null | undefined;
  const notReported = measurementFields.filter((f) => !reported.includes(f.field));
  const when = (value: string | null | undefined) =>
    value && Number.isFinite(Date.parse(value)) ? `${formatRecorded(Date.parse(value))} (${observationLabel(value, now).toLowerCase()})` : "Unknown";
  return (
    <section className="b1-card b1-card-pad" aria-labelledby="details-title">
      <h2 id="details-title" className="b1-h2">
        About this reading
      </h2>
      <p className="b1-sub mt-1">Capture is when the sensor measured. Receipt is when the server stored it.</p>
      <dl className="b1-facts mt-4">
        <dt>Captured</dt>
        <dd>{when(capture)}</dd>
        <dt>Received</dt>
        <dd>{when(receipt)}</dd>
        <dt>Clock</dt>
        <dd>{reading?.clockQuality ?? "Unknown"}</dd>
        <dt>Source</dt>
        <dd>{(reading?.sensorModel ?? telemetry?.sourceFile ?? "Not reported") as string}</dd>
      </dl>
      <details className="b1-details mt-4">
        <summary>Technical details</summary>
        <dl className="b1-facts mt-3">
          <dt>Device ID</dt>
          <dd className="b1-mono">{device.deviceId}</dd>
          <dt>Transport</dt>
          <dd>{(reading?.transport ?? telemetry?.transport ?? "Not reported") as string}</dd>
          <dt>Connection event</dt>
          <dd>
            {telemetry?.receivedAt ? observationLabel(telemetry.receivedAt as string, now) : "None recorded"} · doesn’t refresh a measurement
          </dd>
          <dt>AQI</dt>
          <dd>{reading?.aqi == null ? "Not reported" : `${reading.aqi} · device-reported; calibration not verified`}</dd>
          {notReported.length > 0 && (
            <>
              <dt>Not reported</dt>
              <dd>{notReported.map((f) => f.label).join(" · ")}</dd>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
