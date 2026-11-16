import type { Freshness } from "./measurement-contract";
import type { DeviceSnapshot, SnapshotEntry } from "./device-overview";

/**
 * Data-status tone shown for a unit. These describe stored readings only;
 * none of them asserts that hardware is connected or that air is safe.
 */
export type UnitTone =
  | "loading"
  | "recent"
  | "delayed"
  | "stale"
  | "unknown"
  | "nodata"
  | "error";

export const toneLabels: Record<UnitTone, string> = {
  loading: "Loading",
  recent: "Recent data",
  delayed: "Delayed data",
  stale: "No recent data",
  unknown: "Capture time unknown",
  nodata: "No readings yet",
  error: "Unable to load",
};

export function toneFromFreshness(
  freshness: Freshness | string | undefined,
): UnitTone {
  switch (freshness) {
    case "live":
      return "recent";
    case "delayed":
      return "delayed";
    case "offline":
    case "historical":
      return "stale";
    case "waiting":
      return "nodata";
    default:
      return "unknown";
  }
}

export function needsAttention(tone: UnitTone) {
  return (
    tone === "delayed" ||
    tone === "stale" ||
    tone === "unknown" ||
    tone === "error"
  );
}

export type FleetCounts = Record<UnitTone, number> & {
  total: number;
  attention: number;
};

export function fleetCounts(tones: UnitTone[]): FleetCounts {
  const counts = {
    loading: 0,
    recent: 0,
    delayed: 0,
    stale: 0,
    unknown: 0,
    nodata: 0,
    error: 0,
    total: tones.length,
    attention: 0,
  };
  for (const tone of tones) {
    counts[tone] += 1;
    if (needsAttention(tone)) counts.attention += 1;
  }
  return counts;
}

/** The newest capture time present in a snapshot, or null when unknown. */
export function captureKey(snapshot: DeviceSnapshot | null | undefined) {
  if (!snapshot) return null;
  const times = [
    snapshot.reading?.capturedAt,
    snapshot.telemetry?.measurementAt,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

/**
 * True only when a later poll carries a strictly newer capture time than one
 * already seen in this session. The first observation is never "new".
 */
export function hasNewCapture(
  previous: number | null | undefined,
  next: number | null | undefined,
) {
  return (
    typeof previous === "number" &&
    typeof next === "number" &&
    next > previous
  );
}

export function entryCaptureKey(entry: SnapshotEntry | undefined) {
  return entry?.status === "ready" ? captureKey(entry.snapshot) : null;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
