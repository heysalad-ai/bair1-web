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
