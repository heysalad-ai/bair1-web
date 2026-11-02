import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLoader } from './helpers/load-ts.mjs';
const { publicReading } = createLoader()('src/lib/public-reading.ts');
test('Public readings use an explicit projection and never leak raw or location metadata', () => {
  const secret = randomUUID();
  const result = publicReading({ deviceId: randomUUID(), timestamp: new Date().toISOString(), capturedAt: null, receivedAt: null, clockQuality: 'unknown', aqi: null, pm1: 1, pm25: 2, pm4: null, pm10: 3, rawPayload: { sensitive: secret }, ownerId: secret, lat: 1, lng: 1, rssi: -40, batteryVoltage: 4 });
  assert.equal(result.pm25, 2); assert.equal(result.aqi, null);
  for (const field of ['lat', 'lng', 'rssi', 'batteryVoltage']) assert.equal(result[field], null);
  assert.equal('rawPayload' in result, false); assert.equal('ownerId' in result, false);
  assert.ok(!JSON.stringify(result).includes(secret));
});
