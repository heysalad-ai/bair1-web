import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLoader } from "./helpers/load-ts.mjs";
const {
  deviceOverview,
  dashboardHref,
  snapshotBatchQuery,
  decodeSnapshotBatch,
  SNAPSHOT_BATCH_SIZE,
  dashboardReturnTo,
} = createLoader()("src/lib/device-overview.ts");
test("a new gateway receipt cannot make an old particulate measurement recent", () => {
  const now = Date.now(),
    old = new Date(now - 3600000).toISOString();
  const summary = deviceOverview(
    {
      reading: {
        pm25: 0,
        capturedAt: old,
        receivedAt: new Date(now).toISOString(),
      },
      telemetry: {
        receivedAt: new Date(now).toISOString(),
        temperature: 20,
        temperatureAt: new Date(now).toISOString(),
      },
    },
    now,
  );
  assert.equal(summary.value, "0.0");
  assert.equal(summary.label, "PM2.5");
  assert.equal(summary.freshness, "offline");
  assert.equal(summary.status, "No recent data");
});
test("waiting, unknown capture, bad clock, telemetry fallback and unconfirmed units remain distinct", () => {
  const now = Date.now();
  assert.equal(
    deviceOverview({ reading: null, telemetry: null }, now).status,
    "No readings yet",
  );
  assert.equal(
    deviceOverview({ reading: { pm25: 6 }, telemetry: null }, now).status,
    "Capture time unknown",
  );
  assert.equal(
    deviceOverview(
      { reading: { pm25: 6, capturedAt: "not-a-date" }, telemetry: null },
      now,
    ).age,
    "Capture time unknown",
  );
  assert.equal(
    deviceOverview(
      {
        reading: { pm25: 6, capturedAt: new Date(now + 3600000).toISOString() },
        telemetry: null,
      },
      now,
    ).freshness,
    "unknown",
  );
  const fromTelemetry = deviceOverview(
    {
      reading: null,
      telemetry: {
        temperature: 20,
        temperatureAt: new Date(now - 30000).toISOString(),
      },
    },
    now,
  );
  assert.equal(fromTelemetry.label, "Temperature");
  assert.equal(fromTelemetry.freshness, "live");
  assert.equal(
    deviceOverview(
      {
        reading: null,
        telemetry: {
          pressure: 1000,
          pressureUnit: "unknown",
          pressureAt: new Date(now).toISOString(),
        },
      },
      now,
    ).value,
    "—",
  );
});
test("batch errors clear only the affected unit and never reuse its cached values", () => {
  const ids = [randomUUID(), randomUUID()];
  const result = decodeSnapshotBatch(
    ids,
    {
      data: { r0: null, t0: null, r1: { pm25: 12 }, t1: null },
      errors: [{ path: ["r0"], extensions: { code: "NOT_FOUND" } }],
    },
    200,
  );
  assert.equal(result[ids[0]].status, "error");
  assert.equal(result[ids[0]].snapshot, undefined);
  assert.match(result[ids[0]].message, /Access changed/);
  assert.equal(result[ids[1]].status, "ready");
  assert.equal(result[ids[1]].snapshot.reading.pm25, 12);
  assert.ok(
    Object.values(decodeSnapshotBatch(ids, {}, 401)).every(
      (x) => x.status === "error",
    ),
  );
  assert.ok(
    Object.values(decodeSnapshotBatch(ids, {}, 503)).every(
      (x) => x.status === "error",
    ),
  );
});
test("snapshot batches are bounded and opaque identities remain variables and encoded links", () => {
  const ids = Array.from({ length: SNAPSHOT_BATCH_SIZE }, () => randomUUID());
  const query = snapshotBatchQuery(ids);
  assert.ok(ids.every((id) => !query.query.includes(id)));
  assert.deepEqual(Object.values(query.variables), ids);
  assert.throws(() => snapshotBatchQuery([...ids, randomUUID()]), RangeError);
  assert.throws(() => snapshotBatchQuery([]), RangeError);
  assert.equal(dashboardHref(), "\/dashboard");
  assert.equal(
    dashboardHref("unit & 2", "analytics"),
    "/dashboard?device=unit+%26+2&view=analytics",
  );
});

test("sign-in returns only to local dashboard views and retains the device bookmark", () => {
  const id = randomUUID();
  assert.equal(
    dashboardReturnTo(`/dashboard?device=${id}&view=analytics`),
    dashboardHref(id, "analytics"),
  );
  assert.equal(
    dashboardReturnTo(`/?device=${id}&view=map`),
    dashboardHref(id, "map"),
  );
  for (const target of [
    "https://external.invalid/dashboard",
    "//external.invalid/dashboard",
    "javascript:alert(1)",
    "/factory",
    null,
    {},
  ])
    assert.equal(dashboardReturnTo(target), null);
  assert.equal(dashboardReturnTo("/dashboard?view=invented"), "/dashboard");
});
test("canonical app routing retains device context and the sign-in callback query", async () => {
  const { NextRequest } = await import("next/server.js");
  const { proxy } = createLoader()("src/proxy.ts");
  const id = randomUUID(),
    query = `?device=${id}&view=analytics`;
  const rewritten = proxy(
    new NextRequest(`https://app.bair1.live/${query}`, {
      headers: { host: "app.bair1.live" },
    }),
  );
  assert.equal(
    rewritten.headers.get("x-middleware-rewrite"),
    `https://app.bair1.live/dashboard${query}`,
  );
  const redirected = proxy(
    new NextRequest(`https://bair1.live/dashboard${query}`, {
      headers: { host: "bair1.live" },
    }),
  );
  assert.equal(
    redirected.headers.get("location"),
    `https://app.bair1.live/${query}`,
  );
  const code = randomUUID(),
    state = randomUUID();
  const callback = proxy(
    new NextRequest(`https://app.bair1.live/?code=${code}&state=${state}`, {
      headers: { host: "app.bair1.live" },
    }),
  );
  assert.ok(
    callback.headers
      .get("x-middleware-rewrite")
      .includes(`code=${code}&state=${state}`),
  );
});
