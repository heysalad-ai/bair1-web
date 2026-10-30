// Offline regression tests: no credentials, network requests, or persisted device IDs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { createLoader } from './helpers/load-ts.mjs';
const ingestion = createLoader({'./aws-dynamo': {dynamoClient: {send: () => {throw new Error('Unexpected unit-test network request');}}}})('src/lib/reading-ingestion.ts');

function load(file, mocks = {}, env = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(
    (name) => {
      if (name === "@/lib/storage-config" || name === "./storage-config") return load("src/lib/storage-config.ts", {}, env);
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    }, loaded, loaded.exports, { env },
  );
  return loaded.exports;
}

const responseMock = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };

test('PM-only uploads preserve PM and leave AQI unavailable; explicit zero stays zero', async () => {
  let stored;
  const route = load('src/app/api/readings/route.ts', {
    'next/server': responseMock,
    '@/lib/reading-ingestion': ingestion,
    '@/lib/api-keys': { extractApiKeyFromHeaders: () => null, validateApiKey: async () => ({ type: 'system' }) },
    '@/lib/dynamo': { storeReading: async (value) => { stored = value; return {outcome:'stored',timestamp:new Date().toISOString(),capturedAt:null,receivedAt:new Date().toISOString(),clockQuality:'unknown'}; } },
    '@/lib/geolocation': {},
    '@/lib/devices': { getDevice: async () => ({}), updateDevice: async () => {} },
  });
  for (const aqi of [undefined, null, 0, 57]) {
    const response = await route.POST({ headers: {}, json: async () => ({ deviceId: randomUUID(), pm25: 4, aqi }) });
    assert.equal(response.status, 200);
    assert.equal(stored.aqi, aqi ?? null);
    assert.equal(stored.rawPayload.pm25, 4);
  }
  for (const aqi of ['', false, [], {}, -1, 'NaN', 'Infinity']) {
    const response = await route.POST({ headers: {}, json: async () => ({ deviceId: randomUUID(), aqi }) });
    assert.equal(response.status, 400);
  }
});

test('Notehub PM-only events do not become AQI', async () => {
  let stored;
  const route = load('src/app/api/integrations/notehub/route.ts', {
    'next/server': responseMock,
    '@/lib/reading-ingestion': ingestion,
    '@/lib/devices': { getDevice: async () => ({}), updateDevice: async () => {} },
    '@/lib/dynamo': { setNotecardTelemetry: async () => {}, storeReading: async (value) => { stored = value; return {outcome:'stored',timestamp:new Date().toISOString(),capturedAt:null,receivedAt:new Date().toISOString(),clockQuality:'unknown'}; } },
    '@/lib/notehub': { verifyNotehubSecret: () => true, normalizeNotehubEvent: () => ({ publicDeviceId: randomUUID(), aqi: null, pm25: 4, sanitizedPayload: { pm25: 4 } }) },
  }, { NOTEHUB_ROUTE_SECRET: randomUUID() });
  assert.equal((await route.POST({ headers: {}, json: async () => ({}) })).status, 200);
  assert.equal(stored.aqi, null);
  assert.equal(stored.rawPayload.pm25, 4);
});

test('Dynamo omits missing AQI and round-trips it as null, not zero', async () => {
  let item;
  class Command { constructor(input) { this.input = input; } }
  class PutItemCommand extends Command {}
  const db = load('src/lib/dynamo.ts', {
    '@aws-sdk/client-dynamodb': { PutItemCommand, QueryCommand: Command, ScanCommand: Command },
    './reading-ingestion': { persistReading: async (value) => {item={...value,timestamp:{S:new Date().toISOString()}}; return {outcome:'stored'};} },
    './aws-dynamo': { dynamoClient: { send: async (command) => {
      if (command instanceof PutItemCommand) { item = command.input.Item; return {}; }
      return { Items: item ? [item] : [] };
    } } },
  });
  const deviceId = randomUUID();
  await db.storeReading({ deviceId, aqi: null, rawPayload: { pm25: 4 } });
  assert.equal('aqi' in item, false);
  const readings = await db.getReadings(deviceId, 1);
  assert.equal(readings[0].aqi, null);
  assert.equal(readings[0].pm25, 4);
});

test('Unknown AQI has neutral presentation, while genuine zero remains Good', () => {
  const { getAqiState, getAqiColor } = load('src/lib/aqi.ts');
  assert.equal(getAqiState(null).level, 'AQI unavailable');
  assert.notEqual(getAqiColor(null), getAqiColor(0));
  assert.equal(getAqiState(0).level, 'Good');
});
