import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { createLoader } from './helpers/load-ts.mjs';

// Fixed loopback and dummy credentials: this suite cannot target AWS.
const client = new DynamoDBClient({ endpoint: 'http://127.0.0.1:18743', region: 'local', credentials: { accessKeyId: 'localtest', secretAccessKey: 'localtest' } });
const load = createLoader({ './aws-dynamo': { dynamoClient: client } });
const store = load('src/lib/access-store.ts'), enrollment = load('src/lib/device-enrollment.ts');
const devices = load('src/lib/devices.ts'), db = load('src/lib/dynamo.ts'), sharing = load('src/lib/device-sharing.ts');
const access = load('src/lib/device-access.ts');
const created = [];
const a = randomUUID(), b = randomUUID();
before(async () => {
  process.env.BAIR1_ACCESS_ENABLED = 'true';
  for (const [TableName, pk, sk] of [['bair1-access', 'scope', 'entry'], ['bair1-devices', 'deviceId'], ['bair1-readings', 'deviceId', 'timestamp'], ['bair1-reading-events', 'deviceId', 'eventId'], ['bair1-commands', 'deviceId', 'commandId']]) {
    const input = { TableName, BillingMode: 'PAY_PER_REQUEST', KeySchema: [{ AttributeName: pk, KeyType: 'HASH' }, ...(sk ? [{ AttributeName: sk, KeyType: 'RANGE' }] : [])], AttributeDefinitions: [{ AttributeName: pk, AttributeType: 'S' }, ...(sk ? [{ AttributeName: sk, AttributeType: 'S' }] : [])] };
    if (TableName === 'bair1-access') {
      input.AttributeDefinitions.push({ AttributeName: 'userId', AttributeType: 'S' }, { AttributeName: 'workspaceId', AttributeType: 'S' });
      input.GlobalSecondaryIndexes = [{ IndexName: 'userId-workspaceId-index', KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }, { AttributeName: 'workspaceId', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }];
    }
    await client.send(new CreateTableCommand(input)); created.push(TableName);
  }
});
after(async () => { for (const TableName of created.reverse()) await client.send(new DeleteTableCommand({ TableName })); client.destroy(); delete process.env.BAIR1_ACCESS_ENABLED; });
function fixture(id, ownerId = a, extra = {}) { return { deviceId: id, ownerId, orgId: 'default', name: 'Synthetic fixture', status: 'active', location: '', lat: null, lng: null, createdAt: new Date().toISOString(), ...extra }; }
function actor(id) { return { kind: 'user', user: { userId: id, orgId: 'default', role: 'user' } }; }

test('Explicit workspace invitation grants read access, not control, and revocation is immediate', async () => {
  const workspace = await store.createWorkspace(a, 'Synthetic workspace');
  const invite = await store.createWorkspaceInvite(workspace.workspaceId);
  await store.acceptWorkspaceInvite(workspace.workspaceId, invite.token, b);
  await assert.rejects(store.acceptWorkspaceInvite(workspace.workspaceId, invite.token, randomUUID()));
  assert.equal((await store.workspaceMembers(workspace.workspaceId)).length, 2);
  const device = fixture(randomUUID(), a, { orgId: workspace.workspaceId, visibility: 'workspace' });
  await devices.createDevice(device);
  assert.equal(await access.canAccessDevice(actor(b), device), true);
  assert.equal(await access.canAccessDevice(actor(b), device, 'control'), false);
  assert.equal(await access.canAccessDevice(actor(b), { ...device, visibility: 'private' }), false);
  await store.setWorkspaceMember(workspace.workspaceId, b, null);
  assert.equal(await access.canAccessDevice(actor(b), device), false);
  assert.equal((await store.listWorkspaces(b)).length, 0);
  await assert.rejects(store.setWorkspaceMember(workspace.workspaceId, a, 'member'));
});
test('Default organisation never creates membership; device-bound keys cannot escape their device', async () => {
  const device = fixture(randomUUID());
  assert.equal(await access.canAccessDevice(actor(b), device), false);
  assert.equal(await access.canAccessDevice({ kind: 'api-key', principal: { type: 'developer', userId: a, deviceId: randomUUID() } }, device), false);
});
test('Enrollment proof is one-time, expires, and stores no plaintext secret', async () => {
  const id = randomUUID(); const proof = await enrollment.provisionEnrollment(id, 'Synthetic device');
  const { Item } = await client.send(new GetItemCommand({ TableName: 'bair1-devices', Key: { deviceId: { S: id } } }));
  assert.ok(!JSON.stringify(Item).includes(proof.code));
  assert.equal(await enrollment.claimEnrollment(id, randomUUID(), a, 'personal', 'Device'), null);
  assert.equal((await enrollment.claimEnrollment(id, proof.code, a, 'personal', 'Device')).ownerId, a);
  assert.equal(await enrollment.claimEnrollment(id, proof.code, b, 'personal', 'Device'), null);
  await assert.rejects(enrollment.provisionEnrollment(id, 'Replacement'));
  const expiredId = randomUUID(), expired = await enrollment.provisionEnrollment(expiredId, 'Expired');
  await client.send(new UpdateItemCommand({ TableName: 'bair1-devices', Key: { deviceId: { S: expiredId } }, UpdateExpression: 'SET enrollmentExpiresAt = :e', ExpressionAttributeValues: { ':e': { N: '1' } } }));
  assert.equal(await enrollment.claimEnrollment(expiredId, expired.code, a, 'personal', 'Device'), null);
});
test('Shares expire, revoke individually, and are bound to owner and enrollment version', async () => {
  const id = randomUUID(); await devices.createDevice(fixture(id, a, { ownershipVersion: randomUUID() }));
  const device = await devices.getDevice(id);
  const first = await store.createStoredShare(id, a, device.ownershipVersion);
  const second = await store.createStoredShare(id, a, device.ownershipVersion);
  assert.equal((await store.listStoredShares(id, a)).length, 2);
  assert.equal(await sharing.verifyDeviceShareToken(id, first.token), true);
  assert.equal(await store.storedShareValid(id, first.token, b, device.ownershipVersion), false);
  assert.equal(await store.storedShareValid(id, first.token, a, randomUUID()), false);
  await store.revokeStoredShare(id, a, first.id);
  assert.equal(await sharing.verifyDeviceShareToken(id, first.token), false);
  assert.equal(await sharing.verifyDeviceShareToken(id, second.token), true);
  await client.send(new UpdateItemCommand({ TableName: 'bair1-access', Key: { scope: { S: `device:${id}` }, entry: { S: `share:${second.id}` } }, UpdateExpression: 'SET expiresAt = :e', ExpressionAttributeValues: { ':e': { N: '1' } } }));
  assert.equal(await sharing.verifyDeviceShareToken(id, second.token), false);
  assert.equal(await sharing.verifyDeviceShareToken(id, randomUUID()), false);
});
test('Reused physical IDs do not inherit readings, telemetry, state or commands from a former owner', async () => {
  const id = randomUUID(); await devices.createDevice(fixture(id));
  await db.storeReading({ deviceId: id, aqi: null, rawPayload: { pm25: 5 }, capturedAt: new Date().toISOString(), eventId: randomUUID() });
  await db.setNotecardTelemetry({ deviceId: id, capturedAt: new Date().toISOString(), receivedAt: new Date().toISOString(), temperature: 20 });
  await db.setDeviceState(id, { on: true, brightness: 100 });
  const command = await db.enqueueCommand(id, 'get_state');
  await devices.deleteDevice(id);
  const proof = await enrollment.provisionEnrollment(id, 'New enrollment');
  await enrollment.claimEnrollment(id, proof.code, b, 'personal', 'New enrollment');
  const current = await devices.getDevice(id);
  assert.equal((await db.getReadings(id)).length, 0);
  assert.equal(await db.getNotecardTelemetry(id), null);
  assert.equal((await db.getNotecardTelemetryHistory(id)).length, 0);
  assert.equal((await db.getDeviceState(id)).led.on, false);
  assert.equal((await db.pollCommands(id)).length, 0);
  assert.equal(await db.getCommand(id, command.commandId), null);
  await db.storeReading({ deviceId: id, aqi: null, rawPayload: { pm25: 8 }, capturedAt: new Date().toISOString(), eventId: randomUUID(), ownershipVersion: current.ownershipVersion, tenantId: current.orgId });
  assert.deepEqual((await db.getReadings(id)).map(reading => reading.pm25), [8]);
});
test('Disabled access storage fails closed without offering legacy permanent shares', async () => {
  delete process.env.BAIR1_ACCESS_ENABLED;
  assert.equal(await store.workspaceRole(a, 'default'), null);
  assert.equal(await store.storedShareValid(randomUUID(), randomUUID(), a, 'legacy'), false);
  await assert.rejects(store.createWorkspace(a, 'Disabled'));
  process.env.BAIR1_ACCESS_ENABLED = 'true';
});

test('History pages retain all fields and bind cursors to device, range and ownership generation', async () => {
  process.env.BAIR1_ACCESS_ENABLED = 'true';
  const id = randomUUID(), other = randomUUID(), base = Date.now() - 60000;
  await devices.createDevice(fixture(id, a)); await devices.createDevice(fixture(other, a));
  for (let i = 0; i < 8; i++) await db.storeReading({ deviceId: id, capturedAt: new Date(base + i*1000).toISOString(), eventId: randomUUID(), aqi: null, rawPayload: { temperature: i, adcD3Raw: i, pressure: 1010 } });
  const from = new Date(base - 1000).toISOString(), to = new Date(base + 10000).toISOString();
  const first = await db.getReadingPage(id, { limit: 3, from, to });
  assert.equal(first.data.length, 3); assert.ok(first.nextCursor);
  assert.equal(first.data[0].temperature, 7); assert.equal(first.data[0].adcD3Raw, 7); assert.equal(first.data[0].pressure, 1010);
  await assert.rejects(db.getReadingPage(other, { cursor: first.nextCursor, from, to }), RangeError);
  await assert.rejects(db.getReadingPage(id, { cursor: first.nextCursor }), RangeError);
  const second = await db.getReadingPage(id, { limit: 3, cursor: first.nextCursor, from, to });
  const third = await db.getReadingPage(id, { limit: 3, cursor: second.nextCursor, from, to });
  assert.equal(new Set([...first.data, ...second.data, ...third.data].map(r => r.timestamp)).size, 8);
  assert.equal(third.nextCursor, null);
  await client.send(new UpdateItemCommand({ TableName: 'bair1-devices', Key: { deviceId: { S: id } }, UpdateExpression: 'SET ownershipVersion = :v', ExpressionAttributeValues: { ':v': { S: randomUUID() } } }));
  await assert.rejects(db.getReadingPage(id, { cursor: first.nextCursor, from, to }), RangeError);
});
test('Sparse and out-of-order telemetry never refresh unrelated measurements', async () => {
  const id = randomUUID(); await devices.createDevice(fixture(id, a));
  const at = offset => new Date(Date.now() - 60000 + offset).toISOString();
  const first = at(0), next = at(1000), older = at(-1000);
  await db.setNotecardTelemetry({ deviceId: id, capturedAt: first, receivedAt: first, temperature: 21, pressure: 1010, pressureUnit: 'hPa' });
  await db.setNotecardTelemetry({ deviceId: id, capturedAt: next, receivedAt: next, humidity: 50, deviceStatus: 'connected' });
  await db.setNotecardTelemetry({ deviceId: id, capturedAt: older, receivedAt: older, temperature: 12 });
  const latest = await db.getNotecardTelemetry(id);
  assert.equal(latest.temperature, 21); assert.equal(latest.temperatureAt, first);
  assert.equal(latest.humidityAt, next); assert.equal(latest.receivedAt, next);
  assert.equal(latest.pressure, 1010); assert.equal(latest.pressureUnit, 'hPa'); assert.equal(latest.pressureAt, first);
});
test('Distributed budgets are atomic across concurrent workers and fail closed when disabled', async () => {
  const usage = load('src/lib/usage-budget.ts'), subject = randomUUID();
  const results = await Promise.allSettled(Array.from({length: 35}, () => usage.reserveUsage('chat', subject)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 30);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 5);
  const {Item} = await client.send(new GetItemCommand({TableName:'bair1-access',Key:{scope:{S:`usage:chat:${new Date().toISOString().slice(0,10)}`},entry:{S:'global'}}}));
  assert.equal(Number(Item.count.N), 30); // rejected subject reservations do not consume global capacity
  delete process.env.BAIR1_ACCESS_ENABLED;
  await assert.rejects(usage.reserveUsage('voice', subject), error => error.status === 503);
  process.env.BAIR1_ACCESS_ENABLED = 'true';
});
test('Read snapshots reject ownership changes and workspace revocation during retrieval',async()=>{
 const id=randomUUID();await devices.createDevice(fixture(id,a));
 await assert.rejects(access.withDeviceRead(actor(a),id,async()=>{
  await client.send(new UpdateItemCommand({TableName:'bair1-devices',Key:{deviceId:{S:id}},UpdateExpression:'SET ownerId = :u',ExpressionAttributeValues:{':u':{S:b}}}));return {private:true};
 }),access.DeviceAccessChanged);
 const workspace=await store.createWorkspace(a,'Synthetic race'),invite=await store.createWorkspaceInvite(workspace.workspaceId);
 await store.acceptWorkspaceInvite(workspace.workspaceId,invite.token,b);
 const shared=randomUUID();await devices.createDevice(fixture(shared,a,{visibility:'workspace',orgId:workspace.workspaceId}));
 await assert.rejects(access.withDeviceRead(actor(b),shared,async()=>{await store.setWorkspaceMember(workspace.workspaceId,b,null);return {private:true};}),access.DeviceAccessChanged);
});
test('Command enqueue, acknowledgement and state writes cannot cross enrollment changes',async()=>{
 const id=randomUUID();await devices.createDevice(fixture(id,a));const before=await devices.getDevice(id);
 const command=await db.enqueueCommand(id,'set_led',{on:true,brightness:12},before);
 await client.send(new UpdateItemCommand({TableName:'bair1-devices',Key:{deviceId:{S:id}},UpdateExpression:'SET ownershipVersion = :v',ExpressionAttributeValues:{':v':{S:randomUUID()}}}));
 await assert.rejects(db.enqueueCommand(id,'get_state',null,before));
 await assert.rejects(db.ackCommand(id,command.commandId,true,null,before));
 await assert.rejects(db.setDeviceState(id,{on:true,brightness:12},null,before));
 assert.equal((await db.pollCommands(id)).length,0);
});
