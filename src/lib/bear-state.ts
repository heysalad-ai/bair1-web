import { plural, type FleetCounts, type UnitTone } from "./fleet-insights";

/**
 * Bear moods are driven only by real interface state. The bear never claims
 * to have analysed data, never reassures about health and never rates air.
 */
export type BearMood =
  | "idle"
  | "greeting"
  | "loading"
  | "newData"
  | "attention"
  | "empty"
  | "speaking";

export type BearState = { mood: BearMood; message: string };

export function fleetBearState({
  loading,
  counts,
  newReadings,
}: {
  loading: boolean;
  counts: FleetCounts;
  newReadings: number;
}): BearState {
  if (!counts.total)
    return {
      mood: "empty",
      message: "No units match yet. Clear the search or enrol a device.",
    };
  if (loading && counts.loading === counts.total)
    return { mood: "loading", message: "Fetching your units’ latest readings…" };
  if (newReadings > 0)
    return {
      mood: "newData",
      message: `New ${newReadings === 1 ? "reading" : "readings"} arrived from ${plural(newReadings, "unit")}.`,
    };
  if (counts.error)
    return {
      mood: "attention",
      message: `I couldn’t load readings for ${plural(counts.error, "unit")}. Try refreshing.`,
    };
  const quiet = counts.stale + counts.delayed;
  if (quiet)
    return {
      mood: "attention",
      message: `${plural(quiet, "unit")} ${quiet === 1 ? "hasn’t" : "haven’t"} sent a recent reading.`,
    };
  if (counts.unknown)
    return {
      mood: "attention",
      message: `${plural(counts.unknown, "unit")} ${counts.unknown === 1 ? "has" : "have"} a reading with an unknown capture time.`,
    };
  if (counts.nodata === counts.total)
    return {
      mood: "empty",
      message: "No readings have been stored for these units yet.",
    };
  if (counts.loading)
    return { mood: "loading", message: "Still fetching a few units…" };
  return { mood: "idle", message: "Your latest readings are ready." };
}

export function deviceBearState({
  loading,
  tone,
  denied,
  failed,
  newReading,
}: {
  loading: boolean;
  tone: UnitTone;
  denied: boolean;
  failed: boolean;
  newReading: boolean;
}): BearState {
  if (denied)
    return {
      mood: "attention",
      message: "Your access to this unit changed. Refresh your devices.",
    };
  if (failed)
    return {
      mood: "attention",
      message: "Readings are unavailable right now. Try again shortly.",
    };
  if (loading || tone === "loading")
    return { mood: "loading", message: "Loading this unit’s readings…" };
  if (newReading)
    return { mood: "newData", message: "A new reading just arrived." };
  switch (tone) {
    case "nodata":
      return {
        mood: "empty",
        message: "This unit hasn’t sent a reading yet.",
      };
    case "stale":
      return {
        mood: "attention",
        message: "This unit hasn’t sent a recent reading.",
      };
    case "delayed":
      return {
        mood: "attention",
        message: "The latest reading is a little delayed.",
      };
    case "unknown":
      return {
        mood: "attention",
        message: "This reading’s capture time is unknown.",
      };
    case "error":
      return {
        mood: "attention",
        message: "Readings are unavailable right now. Try again shortly.",
      };
    default:
      return {
        mood: "idle",
        message: "Your latest readings are ready. Choose a measurement to explore.",
      };
  }
}
