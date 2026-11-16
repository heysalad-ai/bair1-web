export function readingSummary(rows: Record<string, unknown>[], field: string) {
  const values = rows
    .map((row) => row[field])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  if (!values.length) return null;
  return {
    count: values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

/**
 * First and latest numeric values in a loaded, time-ordered series. This is a
 * plain difference between two stored readings, not a trend or forecast.
 */
export function windowChange(
  series: { time: number; value: number | null }[],
) {
  const points = series.filter(
    (point): point is { time: number; value: number } =>
      typeof point.value === "number" && Number.isFinite(point.time),
  );
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (last.time <= first.time) return null;
  return {
    first: first.value,
    last: last.value,
    firstTime: first.time,
    lastTime: last.time,
    delta: last.value - first.value,
  };
}
