import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';
const load = createLoader();
const { measurementFreshness: freshness, boundedRange, readingFieldNames } = load('src/lib/measurement-contract.ts');
const { csvField } = load('src/lib/csv.ts');
test('Freshness follows measurement time, handles missing/future and historical events', () => {
  const now = Date.now(), at = seconds => new Date(now - seconds * 1000).toISOString();
  assert.equal(freshness(null, now), 'waiting');
  assert.equal(freshness('invalid', now), 'unknown');
  assert.equal(freshness(at(-120), now), 'unknown');
  assert.equal(freshness(at(40), now), 'live');
  assert.equal(freshness(at(180), now), 'delayed');
  assert.equal(freshness(at(700), now), 'offline');
  assert.equal(freshness(at(90000), now), 'historical');
});
test('Ranges reject reversed, invalid and over-retention requests', () => {
  const now = Date.now(), from = new Date(now - 86400000).toISOString(), to = new Date(now).toISOString();
  assert.deepEqual(boundedRange(from, to), { from, to });
  for (const dates of [[to,from], ['invalid',to], [new Date(now - 15*86400000).toISOString(),to]]) assert.throws(() => boundedRange(...dates), RangeError);
  assert.equal(new Set(readingFieldNames).size, 43);
});
test('CSV preserves genuine numbers and safely quotes formula-like text and delimiters', () => {
  assert.equal(csvField(-5), '"-5"'); assert.equal(csvField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvField(null), '""'); assert.equal(csvField('a,b'), '"a,b"');
});
test('Geolocation disables server-IP fallback and discards SSIDs and inaccurate results', async () => {
  const previousKey = process.env.GOOGLE_MAPS_API_KEY, previousFetch = global.fetch;
  process.env.GOOGLE_MAPS_API_KEY = 'synthetic-test';
  const geo = createLoader()('src/lib/geolocation.ts'); let body;
  global.fetch = async (_url, init) => { body = JSON.parse(init.body); return Response.json({ location: {lat: 0, lng: 0}, accuracy: 25 }); };
  try {
    const resolved = await geo.resolveWifiAccessPoints([{macAddress: '00:00:00:00:00:00', ssid: 'must-not-send'}]);
    assert.equal(resolved.accuracy, 25); assert.equal(body.considerIp, false); assert.equal(body.wifiAccessPoints[0].ssid, undefined);
    global.fetch = async () => Response.json({ location: {lat: 0, lng: 0}, accuracy: 10001 });
    assert.equal(await geo.resolveWifiAccessPoints([{macAddress:'00:00:00:00:00:00'}]), null);
  } finally { global.fetch = previousFetch; if (previousKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = previousKey; }
});
