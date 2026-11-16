"use client";

import { useReducedMotion } from "framer-motion";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { time: number; value: number | null };
type Metric = { field: string; label: string; unit: string; digits: number };

const UTC = "UTC";

export function formatRecorded(time: number) {
  return `${new Date(time).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: UTC,
  })} UTC`;
}

function tickFormatter(span: number) {
  return (value: number) =>
    new Date(value).toLocaleString("en-GB", {
      timeZone: UTC,
      ...(span <= 36 * 3600_000
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "numeric", month: "short" }),
    });
}

const zeroBased = new Set(["pm1", "pm25", "pm4", "pm10", "humidity"]);

export default function TrendChart({
  series,
  metric,
  average,
  height = "100%",
}: {
  series: Point[];
  metric: Metric;
  average?: number | null;
  height?: number | `${number}%`;
}) {
  const reduce = useReducedMotion();
  const gradient = useId().replace(/:/g, "");
  const numeric = series.filter((p) => p.value !== null);
  const span = series.length > 1 ? series[series.length - 1].time - series[0].time : 0;
  const minValue = numeric.length ? Math.min(...numeric.map((p) => p.value as number)) : 0;
  // Isolated samples must remain visible even when every neighbouring point
  // is separated by a missing value or a gap in collection.
  const dotRadius = numeric.length <= 80 ? 2.5 : 1.75;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--b1-primary)" stopOpacity={0.38} />
            <stop offset="100%" stopColor="var(--b1-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--b1-line)" strokeDasharray="2 6" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={tickFormatter(span)}
          minTickGap={48}
          tick={{ fill: "var(--b1-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--b1-line-strong)" }}
          tickLine={false}
        />
        <YAxis
          width={56}
          domain={
            zeroBased.has(metric.field) && minValue >= 0
              ? [0, "auto"]
              : ["auto", "auto"]
          }
          tickFormatter={(value: number) => Number(value.toFixed(metric.digits)).toString()}
          tick={{ fill: "var(--b1-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          label={{
            value: metric.unit,
            angle: -90,
            position: "insideLeft",
            fill: "var(--b1-muted)",
            fontSize: 11,
            dx: 2,
          }}
        />
        <Tooltip
          cursor={{ stroke: "var(--b1-line-strong)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as Point | undefined;
            if (!active || !point || point.value === null) return null;
            return (
              <div className="b1-tooltip">
                <time dateTime={new Date(point.time).toISOString()}>
                  {formatRecorded(point.time)}
                </time>
                <strong className="b1-num">
                  {point.value.toFixed(metric.digits)}
                </strong>{" "}
                <span className="text-[var(--b1-muted)]">
                  {metric.unit} · {metric.label}
                </span>
              </div>
            );
          }}
        />
        {typeof average === "number" && (
          <ReferenceLine
            y={average}
            stroke="var(--b1-ink-2)"
            strokeOpacity={0.55}
            strokeDasharray="4 6"
            ifOverflow="extendDomain"
            label={{
              value: "Avg",
              position: "insideTopRight",
              fill: "var(--b1-muted)",
              fontSize: 11,
            }}
          />
        )}
        <Area
          type="linear"
          dataKey="value"
          name={metric.label}
          stroke="var(--b1-primary)"
          strokeWidth={2.25}
          fill={`url(#${gradient})`}
          connectNulls={false}
          dot={{ r: dotRadius, fill: "var(--b1-primary)", strokeWidth: 0 }}
          activeDot={{ r: 5, stroke: "var(--b1-bg)", strokeWidth: 2, fill: "var(--b1-primary)" }}
          isAnimationActive={!reduce}
          animationDuration={450}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Tiny inline trend for metric tiles; breaks at gaps like the main chart. */
export function Sparkline({ series, width = 120, height = 28 }: { series: Point[]; width?: number; height?: number }) {
  const numeric = series.filter((p) => p.value !== null) as { time: number; value: number }[];
  if (numeric.length < 2) return null;
  const t0 = series[0].time;
  const t1 = series[series.length - 1].time;
  const min = Math.min(...numeric.map((p) => p.value));
  const max = Math.max(...numeric.map((p) => p.value));
  const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * width);
  const y = (v: number) => (max === min ? height / 2 : height - 2 - ((v - min) / (max - min)) * (height - 4));
  let d = "";
  let pen = false;
  for (const point of series) {
    if (point.value === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(point.time).toFixed(1)},${y(point.value).toFixed(1)} `;
    pen = true;
  }
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--b1-primary)" strokeOpacity="0.8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
