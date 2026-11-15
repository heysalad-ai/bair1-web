"use client";

import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { historySeries, measurementFields } from "@/lib/measurement-contract";
import { readingSummary } from "@/lib/reading-summary";
import type { Measurement } from "./MeasurementView";

export default function DeviceTrends({ deviceId }: { deviceId: string }) {
  const request = useAuthenticatedFetch();
  const [windowHours, setWindowHours] = useState(0);
  const [field, setField] = useState("");
  const [rows, setRows] = useState<Measurement[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [updated, setUpdated] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      setBusy(true);
      setError("");
      try {
        const query = new URLSearchParams({ limit: "200" });
        if (windowHours) {
          const now = Date.now();
          query.set(
            "from",
            new Date(now - windowHours * 3600000).toISOString(),
          );
          query.set("to", new Date(now).toISOString());
        }
        const response = await request(
          `/api/devices/${encodeURIComponent(deviceId)}/export?${query}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            response.status === 403 || response.status === 404
              ? "These readings are unavailable or your access changed. Refresh devices to check your access."
              : "History could not be loaded. Try Refresh graph.",
          );
        const result = await response.json();
        if (!active) return;
        setRows(result.data);
        setMore(Boolean(result.nextCursor));
        setUpdated(new Date().toISOString());
      } catch (cause) {
        if (active) {
          setRows([]);
          setMore(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "History unavailable. Try Refresh graph.",
          );
        }
      } finally {
        inFlight = false;
        if (active) setBusy(false);
      }
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [deviceId, windowHours, request, revision]);
  const available = measurementFields.filter((item) =>
    rows.some(
      (row) =>
        typeof row[item.field] === "number" && Number.isFinite(row[item.field]),
    ),
  );
  const metric = available.find((item) => item.field === field) ?? available[0];
  const selected = metric?.field ?? "pm25";
  const chart = historySeries(rows, selected);
  const stats = readingSummary(rows, selected);
  return (
    <section
      className="device-trends"
      aria-labelledby="device-trends-title"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="device-trends-title" className="text-2xl font-semibold">
            Readings over time
          </h2>
          <p className="mt-2 text-sm text-muted">
            Automatic refresh every minute. Recorded times are UTC.
          </p>
        </div>
        <button
          className="access-button"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          {busy ? "Loading graph…" : "Refresh graph"}
        </button>
      </div>
      <div className="my-6 flex flex-wrap gap-4">
        <label>
          Time window
          <select
            className="access-input"
            value={windowHours}
            onChange={(event) => {
              setRows([]);
              setWindowHours(Number(event.target.value));
            }}
          >
            <option value={0}>Latest 200 readings</option>
            <option value={24}>Last 24 hours</option>
            <option value={168}>Last 7 days</option>
            <option value={336}>Last 14 days</option>
          </select>
        </label>
        {available.length > 0 && (
          <label>
            Measurement
            <select
              className="access-input"
              value={selected}
              onChange={(event) => setField(event.target.value)}
            >
              {available.map((item) => (
                <option key={item.field} value={item.field}>
                  {item.label} ({item.unit})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !stats ? (
        <p role="status" className="py-8 text-muted">
          {busy
            ? "Loading stored readings…"
            : "No numeric readings in this window. Try Latest 200 readings or choose a range in History & export."}
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            {rows.length} records loaded · {stats.count} with {metric?.label}
            {more
              ? " · Partial history; open History & export for more records."
              : " · All available records in this window."}
          </p>
          <div
            className="h-72 min-w-0 w-full"
            role="img"
            aria-label={`${metric?.label} over recorded time. Readings and summary are available below.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chart}
                margin={{ left: 0, right: 18, top: 12, bottom: 12 }}
              >
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) =>
                    new Date(value).toISOString().slice(5, 16).replace("T", " ")
                  }
                  minTickGap={45}
                />
                <YAxis width={52} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#162b22",
                    border: "1px solid #547562",
                    color: "#fff",
                  }}
                  labelFormatter={(value) =>
                    Number.isFinite(Number(value))
                      ? new Date(Number(value)).toISOString()
                      : "Unknown time"
                  }
                />
                <Line
                  type="linear"
                  dataKey="value"
                  name={metric?.label}
                  unit={` ${metric?.unit ?? ""}`}
                  stroke="#8dc44a"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-muted">
            Lines break at missing values or gaps over five minutes. Each dot is
            a stored measurement.
          </p>
          <h3 className="mt-8 text-lg font-semibold">Window summary</h3>
          <dl className="trend-summary">
            {[
              ["Minimum", stats.minimum],
              ["Average", stats.average],
              ["Maximum", stats.maximum],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="mt-1 text-xl tabular-nums">
                  {Number(value).toFixed(metric?.digits ?? 1)}{" "}
                  <span className="text-sm text-muted">{metric?.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">
            Calculated from the {stats.count} loaded numeric measurements;
            average is per reading, not weighted by time.
          </p>
          <details className="mt-6">
            <summary className="cursor-pointer">View plotted data</summary>
            <div className="mt-4 max-h-80 overflow-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead>
                  <tr>
                    <th className="p-2">Recorded (UTC)</th>
                    <th className="p-2">
                      {metric?.label} ({metric?.unit})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chart
                    .filter((point) => point.value !== null)
                    .map((point, index) => (
                      <tr key={index}>
                        <td className="p-2">
                          {new Date(point.time).toISOString()}
                        </td>
                        <td className="p-2">{point.value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {!error && updated && (
        <p className="mt-6 text-sm text-muted">
          Graph fetched at{" "}
          {new Date(updated).toLocaleTimeString("en-GB", { timeZone: "UTC" })}{" "}
          UTC. This is the fetch time, not the last sensor capture.
        </p>
      )}
    </section>
  );
}
