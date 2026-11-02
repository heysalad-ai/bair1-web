// Security regressions: actual handlers and GraphQL, generated fixtures, no provider calls.
import path from 'node:path';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLoader } from './helpers/load-ts.mjs';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const sdk = require('@aws-sdk/client-dynamodb');
const userA = { userId: randomUUID(), orgId: 'default', role: 'user', name: 'Synthetic A', email: '' };
const deviceA = { deviceId: randomUUID(), ownerId: userA.userId, orgId: 'default', name: 'Synthetic A', status: 'active' };
const deviceB = { deviceId: randomUUID(), ownerId: randomUUID(), orgId: 'default', name: 'Synthetic B', status: 'active' };
let rows, readCount, queued, capturedChat;
function reset() {
  rows = new Map([deviceA, deviceB].map(d => [d.deviceId, structuredClone(d)]));
  readCount = 0; queued = []; capturedChat = null;
}
function reading(id) {
  readCount++;
  return { deviceId: id, timestamp: '2026-11-02T12:00:00Z', pm25: 7, aqi: 42 };
}
const devices = {
  getDevice: async id => rows.get(id) ?? null,
  getAllDevicesRegistry: async () => [...rows.values()],
  getDevicesForUser: async id => [...rows.values()].filter(d => d.ownerId === id),
};
const dynamo = {
  getReadings: async id => [reading(id)],
  getReadingsInRange: async id => [reading(id)],
  getLatestReading: async id => reading(id),
  getAllDevices: async () => [...rows.keys()],
  getNotecardTelemetry: async () => null,
  getNotecardTelemetryHistory: async () => [],
  enqueueCommand: async (id, type, payload) => {
    const command = { deviceId: id, commandId: 'synthetic-command', type, payload, status: 'pending' };
    queued.push(command); return command;
  },
  pollCommands: async id => [{ deviceId: id, commandId: 'synthetic-command', type: 'get_state' }],
};
const auth = { requireAuth: async req => req.headers.get('authorization') === 'Bearer synthetic-session'
  ? { user: structuredClone(userA) } : Response.json({ error: 'Unauthorized' }, { status: 401 }) };
const apiKeys = {
  extractApiKeyFromHeaders: headers => headers.get('x-api-key'),
  validateApiKey: async key => key === 'synthetic-key'
    ? { type: 'developer', userId: userA.userId, orgId: 'default', scopes: ['read:devices', 'read:readings', 'write:devices'] }
    : null,
};
const google = { getAirQuality: async () => null, getWeather: async () => null, getPollenForecast: async () => [] };
function load(rel, overrides = {}) {
  return createLoader({ '@/lib/auth': auth, './auth': auth,
    '@/lib/api-keys': apiKeys, './api-keys': apiKeys,
    '@/lib/devices': devices, './devices': devices,
    '@/lib/dynamo': dynamo, './dynamo': dynamo,
    '@/lib/google-env': google,
    '@/lib/openai': { GPT_5_6_MODEL: 'synthetic-model' },
    '@/lib/public-feeds': { getPublicFeedSnapshot: async () => null },
    '@/lib/aqi': { getAqiState: () => ({ level: 'synthetic', guidance: ['Synthetic fixture'] }) },
    ...overrides,
  })(rel);
}
function request(method = 'GET', body, kind = 'session') {
  return new Request('https://synthetic.invalid/api/graphql', { method,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(kind === 'key'
      ? { 'x-api-key': 'synthetic-key' } : kind === 'session' ? { authorization: 'Bearer synthetic-session' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function probe(name, _outcome, fn) {
  return test(name, async () => { reset(); await fn(); });
}

await probe('REST reading endpoint rejects another owner before reading data', 'control-present', async () => {
  const route = load('src/app/api/v1/devices/[deviceId]/readings/route.ts');
  const res = await route.GET(request('GET', null, 'key'), { params: Promise.resolve({ deviceId: deviceB.deviceId }) });
  assert.equal(res.status, 404); assert.equal(readCount, 0);
});
await probe('GraphQL denies another owner even in the default organisation', 'isolation-gap', async () => {
  const route = load('src/app/api/graphql/route.ts');
  const query = `{ registeredDevices { deviceId } readings(deviceId: "${deviceB.deviceId}") { deviceId } }`;
  const res = await route.POST(request('POST', { query })); const json = await res.json();
  assert.ok(json.errors?.length); assert.equal(readCount, 0);
  assert.ok(!json.data?.registeredDevices?.some(d => d.deviceId === deviceB.deviceId));
});
await probe('GraphQL rejects a non-owner in a different organisation', 'control-present', async () => {
  rows.get(deviceB.deviceId).orgId = 'synthetic-distinct-org';
  const route = load('src/app/api/graphql/route.ts');
  const res = await route.POST(request('POST', { query: `{ readings(deviceId: "${deviceB.deviceId}") { deviceId } }` }));
  const json = await res.json(); assert.ok(json.errors?.length); assert.equal(readCount, 0);
});
await probe('Device registration cannot overwrite another owner or expose their history', 'isolation-gap', async () => {
  const fakeClient = { send: async command => {
    const input = command.input;
    if (command instanceof sdk.PutItemCommand) {
      const id = input.Item.deviceId.S;
      if (input.ConditionExpression && rows.has(id)) throw new sdk.ConditionalCheckFailedException({ $metadata: {}, message: 'exists' });
      rows.set(id, Object.fromEntries(Object.entries(input.Item).map(([k, v]) => [k, v.S ?? v.N]))); return {};
    }
    throw new Error('Unexpected database command');
  } };
  const actualDevices = load('src/lib/devices.ts', { './storage-config': { storageTable: n => n }, './aws-dynamo': { dynamoClient: fakeClient } });
  const route = load('src/app/api/developer/devices/route.ts', { '@/lib/devices': actualDevices });
  const res = await route.POST(request('POST', { deviceId: deviceB.deviceId, name: 'Synthetic replacement' }));
  assert.equal(res.status, 409); assert.equal(rows.get(deviceB.deviceId).ownerId, deviceB.ownerId);
  const readRoute = load('src/app/api/v1/devices/[deviceId]/readings/route.ts');
  const history = await readRoute.GET(request('GET', null, 'key'), { params: Promise.resolve({ deviceId: deviceB.deviceId }) });
  assert.equal(history.status, 404); assert.equal(readCount, 0);
});
await probe('Share creation denies a different owner in the default organisation', 'isolation-gap', async () => {
  const route = load('src/app/api/devices/[deviceId]/share/route.ts', { '@/lib/device-sharing': { createDeviceShareToken: () => 'synthetic-share' } });
  const res = await route.POST(request('POST', {}), { params: Promise.resolve({ deviceId: deviceB.deviceId }) });
  assert.equal(res.status, 404);
});
await probe('Command creation rejects a non-owner developer key', 'isolation-gap', async () => {
  const route = load('src/app/api/v1/devices/[deviceId]/commands/route.ts');
  const res = await route.POST(request('POST', { type: 'get_state' }, 'key'), { params: Promise.resolve({ deviceId: deviceB.deviceId }) });
  assert.equal(res.status, 404); assert.equal(queued.length, 0);
});
await probe('Command poll rejects a non-owner developer key', 'isolation-gap', async () => {
  const route = load('src/app/api/v1/devices/[deviceId]/commands/poll/route.ts');
  const req = request('GET', null, 'key'); req.nextUrl = new URL(req.url);
  const res = await route.GET(req, { params: Promise.resolve({ deviceId: deviceB.deviceId }) });
  assert.equal(res.status, 404);
});
await probe('Anonymous private chat fails before reaching any data/model tool', 'isolation-gap', async () => {
  const route = load('src/app/api/chat/route.ts', {
    ai: { convertToModelMessages: async x => x, stepCountIs: () => () => false,
      streamText: options => { capturedChat = options; return { toUIMessageStreamResponse: () => new Response('synthetic stream') }; } },
    '@ai-sdk/openai': { openai: () => ({ synthetic: true }) },
  });
  const res = await route.POST(request('POST', { messages: [] }, 'anonymous'));
  assert.equal(res.status, 401); assert.equal(capturedChat, null); assert.equal(readCount, 0);
});
await probe('Anonymous voice briefing fails before reading a supplied device', 'isolation-gap', async () => {
  const route = load('src/app/api/voice/briefing/route.ts');
  const req = request('GET', null, 'anonymous'); req.nextUrl = new URL(`https://synthetic.invalid/api?deviceId=${deviceB.deviceId}`);
  const res = await route.GET(req); assert.equal(res.status, 401); assert.equal(readCount, 0);
});


await probe('An authenticated AI tool cannot query another owner and lists only owned devices', '', async () => {
  const route = load('src/app/api/chat/route.ts', {
    ai: { convertToModelMessages: async x => x, stepCountIs: () => () => false,
      streamText: options => { capturedChat = options; return { toUIMessageStreamResponse: () => new Response('synthetic stream') }; } },
    '@ai-sdk/openai': { openai: () => ({ synthetic: true }) },
  });
  assert.equal((await route.POST(request('POST', { messages: [] }))).status, 200);
  const listed = await capturedChat.tools.listDevices.execute({});
  assert.deepEqual(listed.map(d => d.deviceId), [deviceA.deviceId]);
  assert.equal((await capturedChat.tools.getSensorData.execute({ deviceId: deviceB.deviceId })).error, 'device not found');
  assert.equal((await capturedChat.tools.getSensorHistory.execute({ deviceId: deviceB.deviceId, hoursBack: 1 })).error, 'device not found');
  assert.equal(readCount, 0);
  assert.equal((await capturedChat.tools.getSensorData.execute({ deviceId: deviceA.deviceId })).deviceId, deviceA.deviceId);
});
await probe('Owner command creation succeeds while ack/status reject another owner', '', async () => {
  const own = load('src/app/api/v1/devices/[deviceId]/commands/route.ts');
  assert.equal((await own.POST(request('POST', { type: 'get_state' }, 'key'), { params: Promise.resolve({ deviceId: deviceA.deviceId }) })).status, 202);
  assert.equal(queued.length, 1);
  for (const [file, method] of [['commands/ack', 'POST'], ['commands/[commandId]', 'GET']]) {
    const route = load(`src/app/api/v1/devices/[deviceId]/${file}/route.ts`);
    const result = await route[method](request(method, method === 'POST' ? { commandId: randomUUID() } : null, 'key'), { params: Promise.resolve({ deviceId: deviceB.deviceId, commandId: randomUUID() }) });
    assert.equal(result.status, 404);
  }
});
await probe('Voice denies another owner before reading or sending provider data', '', async () => {
  const route = load('src/app/api/voice/briefing/route.ts');
  const req = request(); req.nextUrl = new URL(`https://synthetic.invalid/?deviceId=${deviceB.deviceId}`);
  assert.equal((await route.GET(req)).status, 404); assert.equal(readCount, 0);
});
await probe('Owner GraphQL reads still work and a customer admin has no platform bypass', '', async () => {
  const route = load('src/app/api/graphql/route.ts');
  const res = await route.POST(request('POST', { query: `{ readings(deviceId: "${deviceA.deviceId}") { deviceId } }` }));
  assert.equal((await res.json()).data.readings[0].deviceId, deviceA.deviceId);
  const access = load('src/lib/device-access.ts');
  assert.equal(access.canAccessDevice({ kind: 'user', user: { ...userA, role: 'admin' } }, deviceB), false);
  assert.equal(access.canAccessDevice({ kind: 'user', user: { ...userA, role: 'super_admin' } }, deviceB), true);
});

await probe('Public latest only queries explicitly published devices', '', async () => {
  const route = load('src/app/api/readings/latest/route.ts', {
    '@/lib/public-feeds': { PUBLIC_FEEDS: { fixture: { devices: [{ deviceId: deviceA.deviceId }] } } },
    '@/lib/dynamo': { getLatestReading: async id => { assert.equal(id, deviceA.deviceId); return reading(id); } },
  });
  const res = await route.GET();
  assert.equal(res.status, 200); assert.equal((await res.json()).deviceId, deviceA.deviceId);
});
test('New personal users do not join a shared default or migrate unverified email', async (t) => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  const sub = randomUUID(); let saved; let emailLookups = 0;
  globalThis.fetch = async () => Response.json({ sub, email: 'fixture@example.invalid', email_verified: false });
  const realAuth = createLoader({ './users': {
    getUser: async () => null, getUserByEmail: async () => { emailLookups++; return null; },
    upsertUser: async user => { saved = user; },
  } })('src/lib/auth.ts');
  await realAuth.getOrCreateUser(randomUUID());
  assert.ok(saved.orgId.startsWith('personal:')); assert.equal(saved.role, 'user'); assert.equal(emailLookups, 0);
});
