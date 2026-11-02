"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import {
  historySeries,
  measurementFields,
  measurementFreshness,
  observationLabel,
  readingFieldNames,
} from "@/lib/measurement-contract";

export type Measurement = Record<string, string | number | null>;
export function MeasurementView({
  reading,
  telemetry,
}: {
  reading: Measurement | null;
  telemetry: Measurement | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const timestamp = reading?.capturedAt || telemetry?.measurementAt;
  const hasValues = measurementFields.some(
    (field) =>
      reading?.[field.field] != null || telemetry?.[field.field] != null,
  );
  return (
    <section aria-label="Device measurements">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-5">
        <div>
          <h2 className="text-xl font-semibold">Measurements</h2>
          <p className="mt-1 text-sm text-muted">
            {timestamp
              ? observationLabel(timestamp as string, now)
              : hasValues
                ? "Capture time unknown"
                : "No measurement yet"}
          </p>
        </div>
        <span className="rounded-md bg-surface px-3 py-1 text-sm capitalize">
          {!timestamp && hasValues
            ? "unknown"
            : measurementFreshness(timestamp as string, now)}
        </span>
      </div>
      {!hasValues && (
        <p className="py-8 text-muted">
          Waiting for the first measurement. The device is registered; no values
          have been invented.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-4">
        {[...measurementFields]
          .sort(
            (a, b) =>
              Number(
                reading?.[b.field] != null || telemetry?.[b.field] != null,
              ) -
              Number(
                reading?.[a.field] != null || telemetry?.[a.field] != null,
              ),
          )
          .map((field) => {
            const deviceValue = reading?.[field.field];
            const fromTelemetry =
              deviceValue == null && telemetry?.[field.field] != null;
            const value = fromTelemetry
              ? telemetry?.[field.field]
              : deviceValue;
            const unknownPressure =
              field.field === "pressure" &&
              fromTelemetry &&
              telemetry?.pressureUnit !== "hPa";
            const measuredAt = fromTelemetry
              ? telemetry?.[`${field.field}At`]
              : reading?.capturedAt;
            return (
              <div key={field.field} className="border-b border-border py-5">
                <dt className="text-sm text-muted">{field.label}</dt>
                <dd className="mt-2 text-2xl font-medium tabular-nums">
                  {typeof value === "number" && !unknownPressure
                    ? value.toFixed(field.digits)
                    : "—"}
                  <span className="ml-1 text-xs font-normal text-muted">
                    {field.unit}
                  </span>
                </dd>
                <dd className="mt-1 text-xs text-muted">
                  {unknownPressure
                    ? "Unit unconfirmed"
                    : value == null
                      ? "Not reported"
                      : !measuredAt
                        ? "Capture time unknown"
                        : observationLabel(measuredAt as string, now)}
                </dd>
              </div>
            );
          })}
      </dl>
      <div className="mt-6 space-y-2 text-sm text-muted">
        <p>
          AQI:{" "}
          {reading?.aqi == null
            ? "Not reported. Raw gas and ADC values are not calibrated AQI."
            : `${reading.aqi} · device-reported; calibration must be verified separately.`}
        </p>
        <p>
          Connection event:{" "}
          {observationLabel(
            (telemetry?.receivedAt || reading?.receivedAt) as string,
            now,
          )}
          . A connection event does not refresh a measurement.
        </p>
        <p>
          Capture:{" "}
          {timestamp ? new Date(timestamp).toLocaleString("en-GB") : "Unknown"}{" "}
          · Receipt:{" "}
          {reading?.receivedAt
            ? new Date(reading.receivedAt).toLocaleString("en-GB")
            : "Unknown"}{" "}
          · Clock: {reading?.clockQuality ?? "Unknown"}
        </p>
        <p>
          Source:{" "}
          {reading?.sensorModel ?? telemetry?.sourceFile ?? "Not reported"} ·
          Transport:{" "}
          {reading?.transport ?? telemetry?.transport ?? "Not reported"}
        </p>
      </div>
    </section>
  );
}

export function ReadingHistory({ deviceId }: { deviceId: string }) {
  const request = useAuthenticatedFetch();
  const [rows, setRows] = useState<Measurement[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [field, setField] = useState<string>("pm25");
  const [range, setRange] = useState(() => ({
    from: new Date(Date.now() - 86400000).toISOString().slice(0, 16),
    to: new Date().toISOString().slice(0, 16),
  }));
  const chart = useMemo(() => historySeries(rows, field), [rows, field]);
  const selectedField = measurementFields.find((item) => item.field === field);
  async function load(append = false) {
    setBusy(true);
    setError("");
    if (!append) {
      setRows([]);
      setCursor(null);
      setLoaded(false);
    }
    try {
      const query = new URLSearchParams({
        from: new Date(`${range.from}Z`).toISOString(),
        to: new Date(`${range.to}Z`).toISOString(),
        limit: "200",
      });
      if (append && cursor) query.set("cursor", cursor);
      const response = await request(
        `/api/devices/${encodeURIComponent(deviceId)}/export?${query}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "History unavailable");
      setRows((current) =>
        append ? [...current, ...result.data] : result.data,
      );
      setCursor(result.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "History unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        format: "csv",
        from: new Date(`${range.from}Z`).toISOString(),
        to: new Date(`${range.to}Z`).toISOString(),
      });
      const response = await request(
        `/api/devices/${encodeURIComponent(deviceId)}/export?${query}`,
      );
      if (!response.ok)
        throw new Error((await response.json()).error || "Export unavailable");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "bair1-readings.csv";
      a.click();
      URL.revokeObjectURL(url);
      if (response.headers.get("X-Bair1-Possibly-Truncated") === "true")
        setError(
          "Export reached 10,000 records. Choose a smaller range or use paginated JSON for all records.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2 className="text-2xl font-semibold">Measurement history</h2>
      <p className="mt-2 text-sm text-muted">
        Choose up to 14 days, within available retention. Times below are UTC.
        Missing values remain blank. CSV contains all {readingFieldNames.length}{" "}
        fields, up to 10,000 records.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
        className="my-6 flex flex-wrap items-end gap-4"
      >
        <label>
          From (UTC)
          <input
            required
            type="datetime-local"
            disabled={busy}
            value={range.from}
            onChange={(e) => {
              setRange({ ...range, from: e.target.value });
              setLoaded(false);
              setRows([]);
              setCursor(null);
            }}
            className="access-input"
          />
        </label>
        <label>
          To (UTC)
          <input
            required
            type="datetime-local"
            disabled={busy}
            value={range.to}
            onChange={(e) => {
              setRange({ ...range, to: e.target.value });
              setLoaded(false);
              setRows([]);
              setCursor(null);
            }}
            className="access-input"
          />
        </label>
        <button disabled={busy} className="access-button">
          {busy ? "Loading…" : "Load history"}
        </button>
        <button
          disabled={busy}
          type="button"
          onClick={download}
          className="access-button"
        >
          Download CSV
        </button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-red-300">
          {error}
        </p>
      )}
      {loaded && (
        <>
          <label>
            Measurement
            <select
              className="access-input max-w-xs"
              value={field}
              onChange={(e) => setField(e.target.value)}
            >
              {measurementFields.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label} ({f.unit})
                </option>
              ))}
            </select>
          </label>
          <p className="my-4 text-sm text-muted">
            {rows.length} records loaded
            {cursor ? "; more available" : "; end of selected range"}.
          </p>
          {rows.length > 0 && (
            <figure className="my-6">
              <figcaption className="mb-3 text-sm text-muted">
                {selectedField?.label} ({selectedField?.unit}) · recorded time
                (UTC). Lines break at missing values or gaps over five minutes.
              </figcaption>
              <div
                className="h-64 w-full"
                role="img"
                aria-label={`${selectedField?.label} history; the accessible data table follows`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chart}
                    margin={{ left: 8, right: 16, top: 12, bottom: 12 }}
                  >
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(value) =>
                        new Date(value).toISOString().slice(11, 16)
                      }
                    />
                    <YAxis width={48} domain={["auto", "auto"]} />
                    <Tooltip
                      labelFormatter={(value) =>
                        Number.isFinite(Number(value))
                          ? new Date(Number(value)).toISOString()
                          : "Time unknown"
                      }
                    />
                    <Line
                      type="linear"
                      dataKey="value"
                      name={selectedField?.label}
                      unit={` ${selectedField?.unit ?? ""}`}
                      stroke="#8dc44a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>
          )}
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-bg">
                <tr>
                  <th className="p-3">Recorded (UTC)</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Clock quality</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.timestamp}-${i}`}
                    className="border-t border-border"
                  >
                    <td className="p-3">
                      {String(row.capturedAt || row.timestamp)}
                    </td>
                    <td className="p-3">{row[field] ?? "—"}</td>
                    <td className="p-3">{row.clockQuality ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="py-6 text-muted">
              No readings in this range. Try another time window.
            </p>
          )}
          {cursor && (
            <button
              disabled={busy || rows.length >= 10000}
              onClick={() => load(true)}
              className="access-button mt-4"
            >
              Load next 200
            </button>
          )}
          {rows.length >= 10000 && (
            <p>
              Browser preview limited to 10,000 records. Narrow the range or
              continue through the paginated API.
            </p>
          )}
        </>
      )}
    </section>
  );
}
