import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLoader } from "./helpers/load-ts.mjs";

const load = createLoader();
const insights = load("src/lib/fleet-insights.ts");
const bear = load("src/lib/bear-state.ts");
const spoken = load("src/lib/spoken-summary.ts");
const metrics = load("src/lib/snapshot-metrics.ts");
const summary = load("src/lib/reading-summary.ts");
const overview = load("src/lib/device-overview.ts");

const iso = (msAgo, now) => new Date(now - msAgo).toISOString();

test("freshness maps to data-status tones without claiming connectivity", () => {
  assert.equal(insights.toneFromFreshness("live"), "recent");
  assert.equal(insights.toneFromFreshness("delayed"), "delayed");
  assert.equal(insights.toneFromFreshness("offline"), "stale");
  assert.equal(insights.toneFromFreshness("historical"), "stale");
  assert.equal(insights.toneFromFreshness("waiting"), "nodata");
  assert.equal(insights.toneFromFreshness("unknown"), "unknown");
  for (const label of Object.values(insights.toneLabels))
    assert.doesNotMatch(label, /online|connected|safe|healthy/i);
});

test("fleet counts group attention states", () => {
  const counts = insights.fleetCounts(["recent", "stale", "delayed", "error", "nodata", "unknown", "loading"]);
  assert.equal(counts.total, 7);
  assert.equal(counts.attention, 4);
  assert.equal(counts.recent, 1);
  assert.equal(counts.loading, 1);
});

test("only a strictly newer capture counts as a new reading", () => {
  assert.equal(insights.hasNewCapture(undefined, 10), false);
  assert.equal(insights.hasNewCapture(null, 10), false);
  assert.equal(insights.hasNewCapture(10, 10), false);
  assert.equal(insights.hasNewCapture(10, 9), false);
  assert.equal(insights.hasNewCapture(10, 11), true);
});

test("a recent gateway receipt is not treated as a new capture", () => {
  const now = Date.now();
  const captured = iso(3_600_000, now);
  const before = insights.captureKey({ reading: { capturedAt: captured, receivedAt: iso(60_000, now) }, telemetry: null });
  const after = insights.captureKey({ reading: { capturedAt: captured, receivedAt: iso(0, now) }, telemetry: { receivedAt: iso(0, now) } });
  assert.equal(insights.hasNewCapture(before, after), false);
  assert.equal(insights.captureKey({ reading: { capturedAt: "not a date" }, telemetry: null }), null);
});

test("fleet bear messages follow real state and never assess air", () => {
  const counts = (tones) => insights.fleetCounts(tones);
  assert.equal(bear.fleetBearState({ loading: false, counts: counts(["recent", "recent"]), newReadings: 0 }).mood, "idle");
  assert.equal(bear.fleetBearState({ loading: true, counts: counts(["loading"]), newReadings: 0 }).mood, "loading");
  assert.match(bear.fleetBearState({ loading: false, counts: counts(["recent", "stale"]), newReadings: 0 }).message, /1 unit hasn’t sent a recent reading/);
  assert.equal(bear.fleetBearState({ loading: false, counts: counts(["recent"]), newReadings: 1 }).mood, "newData");
  assert.equal(bear.fleetBearState({ loading: false, counts: counts(["error", "recent"]), newReadings: 0 }).mood, "attention");
  assert.equal(bear.fleetBearState({ loading: false, counts: counts(["nodata"]), newReadings: 0 }).mood, "empty");
  assert.equal(bear.fleetBearState({ loading: false, counts: counts([]), newReadings: 0 }).mood, "empty");
  const all = [
    bear.fleetBearState({ loading: false, counts: counts(["recent"]), newReadings: 0 }),
    bear.deviceBearState({ loading: false, tone: "recent", denied: false, failed: false, newReading: false }),
    bear.deviceBearState({ loading: false, tone: "stale", denied: false, failed: false, newReading: false }),
  ];
  for (const state of all) assert.doesNotMatch(state.message, /safe|healthy|good air|clean|analys/i);
});

test("device bear prioritises access and failure over freshness", () => {
  assert.match(bear.deviceBearState({ loading: false, tone: "recent", denied: true, failed: false, newReading: true }).message, /access/);
  assert.equal(bear.deviceBearState({ loading: false, tone: "recent", denied: false, failed: true, newReading: false }).mood, "attention");
  assert.equal(bear.deviceBearState({ loading: true, tone: "recent", denied: false, failed: false, newReading: false }).mood, "loading");
  assert.equal(bear.deviceBearState({ loading: false, tone: "nodata", denied: false, failed: false, newReading: false }).mood, "empty");
  assert.equal(bear.deviceBearState({ loading: false, tone: "recent", denied: false, failed: false, newReading: true }).mood, "newData");
});

test("snapshot metrics keep zero, prefer sensor readings and hold unconfirmed pressure", () => {
  const now = Date.now();
  const list = metrics.snapshotMetrics({
    reading: { pm25: 0, capturedAt: iso(30_000, now) },
    telemetry: { pm25: 9, temperature: 21, temperatureAt: iso(10_000, now), pressure: 1000, pressureUnit: "unknown", pressureAt: iso(10_000, now) },
  });
  const pm = list.find((m) => m.field === "pm25");
  assert.equal(pm.value, 0);
  assert.equal(pm.source, "reading");
  assert.equal(list.find((m) => m.field === "temperature").source, "telemetry");
  const pressure = list.find((m) => m.field === "pressure");
  assert.equal(pressure.value, null);
  assert.equal(pressure.unconfirmed, true);
  assert.equal(list.some((m) => m.field === "humidity"), false);
  assert.equal(metrics.formatValue(0, 1), "0.0");
  assert.equal(metrics.formatValue(null, 1), "—");
});

test("window change compares first and latest loaded values across gaps", () => {
  assert.equal(summary.windowChange([{ time: 1, value: 4 }]), null);
  assert.equal(summary.windowChange([{ time: 1, value: null }, { time: 2, value: 4 }]), null);
  const change = summary.windowChange([
    { time: 1, value: 4 },
    { time: 2, value: null },
    { time: 3, value: 2.5 },
  ]);
  assert.equal(change.delta, -1.5);
  assert.equal(change.firstTime, 1);
  assert.equal(change.lastTime, 3);
});

test("spoken summaries restate stored values only and say what they cannot confirm", () => {
  const counts = insights.fleetCounts(["recent", "stale", "error"]);
  const fleet = spoken.fleetSpokenSummary(counts);
  assert.match(fleet, /3 units/);
  assert.match(fleet, /does not confirm/);
  const text = spoken.deviceSpokenSummary({
    name: "Synthetic unit",
    metric: { label: "PM2.5", unit: "µg/m³", digits: 1 },
    latest: 0,
    age: "2 min ago",
    status: "Recent data",
    stats: { count: 3, minimum: 0, maximum: 4.25, average: 2 },
    windowLabel: "Last 24 hours",
    partial: true,
  });
  assert.match(text, /Latest PM2\.5: 0 micrograms per cubic metre, captured 2 min ago/);
  assert.match(text, /average per reading/);
  assert.match(text, /part of the history/);
  assert.doesNotMatch(text, /µg|safe|healthy|good/i);
});

test("new UI keeps the existing bounded snapshot contract", () => {
  const ids = Array.from({ length: overview.SNAPSHOT_BATCH_SIZE }, () => randomUUID());
  const query = overview.snapshotBatchQuery(ids);
  for (const id of ids) assert.equal(query.query.includes(id), false);
  assert.equal(overview.DEVICE_PAGE_SIZE, 24);
});
