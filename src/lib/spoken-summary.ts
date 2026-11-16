import { plural, type FleetCounts } from "./fleet-insights";

const spokenUnits: Record<string, string> = {
  "µg/m³": "micrograms per cubic metre",
  "°C": "degrees Celsius",
  "% RH": "percent relative humidity",
  hPa: "hectopascals",
  V: "volts",
  m: "metres",
  counts: "counts",
};

export function spokenUnit(unit: string) {
  return spokenUnits[unit] ?? unit;
}

const trim = (value: number, digits: number) =>
  Number(value.toFixed(digits)).toString();

/**
 * Text that is both shown and spoken verbatim. It restates stored values and
 * their age; it never interprets health, safety or air quality.
 */
export function fleetSpokenSummary(counts: FleetCounts) {
  if (!counts.total) return "You have no units to summarise yet.";
  const parts = [`You can see ${plural(counts.total, "unit")} on this page.`];
  if (counts.recent) parts.push(`${counts.recent} sent a recent reading.`);
  if (counts.delayed) parts.push(`${counts.delayed} ${counts.delayed === 1 ? "is" : "are"} delayed.`);
  if (counts.stale)
    parts.push(
      `${counts.stale} ${counts.stale === 1 ? "hasn’t" : "haven’t"} sent a recent reading.`,
    );
  if (counts.unknown)
    parts.push(`${counts.unknown} ${counts.unknown === 1 ? "has" : "have"} an unknown capture time.`);
  if (counts.nodata)
    parts.push(`${counts.nodata} ${counts.nodata === 1 ? "has" : "have"} no stored readings yet.`);
  if (counts.error)
    parts.push(`${counts.error} couldn’t be loaded.`);
  if (counts.loading) parts.push(`${counts.loading} ${counts.loading === 1 ? "is" : "are"} still loading.`);
  parts.push(
    "This describes stored readings. It does not confirm that a unit is connected right now.",
  );
  return parts.join(" ");
}

export function deviceSpokenSummary({
  name,
  metric,
  latest,
  age,
  status,
  stats,
  windowLabel,
  partial,
}: {
  name: string;
  metric?: { label: string; unit: string; digits: number };
  latest?: number | null;
  age?: string;
  status: string;
  stats?: { count: number; minimum: number; maximum: number; average: number } | null;
  windowLabel: string;
  partial: boolean;
}) {
  const parts = [`${name}. Status: ${status}.`];
  if (metric && typeof latest === "number")
    parts.push(
      `Latest ${metric.label}: ${trim(latest, metric.digits)} ${spokenUnit(metric.unit)}${age ? `, captured ${age.toLowerCase()}` : ""}.`,
    );
  else if (metric) parts.push(`The latest reading has no ${metric.label} value.`);
  if (metric && stats)
    parts.push(
      `In the ${windowLabel.toLowerCase()}, ${plural(stats.count, "loaded reading")} ranged from ${trim(stats.minimum, metric.digits)} to ${trim(stats.maximum, metric.digits)} ${spokenUnit(metric.unit)}, with an average per reading of ${trim(stats.average, metric.digits)}.`,
    );
  else if (metric)
    parts.push(`There are no ${metric.label} readings in the ${windowLabel.toLowerCase()}.`);
  if (partial) parts.push("Only part of the history is loaded.");
  parts.push("A stored reading does not confirm the unit is connected right now.");
  return parts.join(" ");
}

/** The visible and spoken copy is immutable while live readings keep updating. */
export function spokenSnapshot(summary: string) {
  return { source: summary, text: `This summary describes the readings shown when you requested it. ${summary}` };
}
