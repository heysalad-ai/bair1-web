import { randomUUID } from "node:crypto";
import { GetItemCommand, PutItemCommand, QueryCommand, TransactWriteItemsCommand, TransactionCanceledException, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";
import { storageTable } from "./storage-config";
import { prepareApiKey } from "./api-keys";
import { getDevice } from "./devices";
import type { User } from "./users";
import type { Reading } from "./dynamo";

const access = storageTable("bair1-access"), devices = storageTable("bair1-devices"), keys = storageTable("bair1-api-keys");
const seconds = () => Math.floor(Date.now() / 1000);
const grantKey = (userId: string) => ({ scope: { S: `factory:${userId}` }, entry: { S: "grant" } });
const unitKey = (batchId: string, deviceId: string) => ({ scope: { S: `factory-batch:${batchId}` }, entry: { S: `device:${deviceId}` } });
export class FactoryError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export type FactoryGrant = { batchId: string; expiresAt: number; remaining: number; maximum: number };
export type FactoryUnit = { deviceId: string; ownershipVersion: string; createdAt: string; sessionId: string | null; keyId: string | null; configuredAt: string | null };
function unit(row: Record<string, AttributeValue>): FactoryUnit {
  return { deviceId: row.deviceId.S!, ownershipVersion: row.ownershipVersion.S!, createdAt: row.createdAt.S!, sessionId: row.sessionId?.S ?? null, keyId: row.keyId?.S ?? null, configuredAt: row.configuredAt?.S ?? null };
}
export function validateFactoryDeviceId(value: unknown): string {
  if (typeof value !== "string" || !/^XIAO-[0-9A-F]{12}$/.test(value)) throw new FactoryError("Connect a XIAO ESP32-S3 board to read its hardware identity.", 400);
  return value;
}
export async function getFactoryGrant(userId: string): Promise<FactoryGrant> {
  const { Item } = await dynamoClient.send(new GetItemCommand({ TableName: access, Key: grantKey(userId), ConsistentRead: true }));
  if (!Item || Item.revokedAt || Number(Item.expiresAt?.N) <= seconds()) throw new FactoryError("Factory access is unavailable or expired. Ask Peter to enable this account.", 403);
  return { batchId: Item.batchId.S!, expiresAt: Number(Item.expiresAt.N), remaining: Number(Item.remaining.N), maximum: Number(Item.maximum.N) };
}
/** Administrative capability, never granted merely by signing up or knowing a chip ID. */
export async function createFactoryGrant(userId: string, maximum = 25) {
  if (!userId || userId.length > 200 || !Number.isInteger(maximum) || maximum < 1 || maximum > 100) throw new FactoryError("Valid user and unit limit required", 400);
  const grant = { batchId: randomUUID(), expiresAt: seconds() + 7 * 86400, remaining: maximum, maximum };
  await dynamoClient.send(new PutItemCommand({ TableName: access, Item: { ...grantKey(userId), batchId: { S: grant.batchId }, expiresAt: { N: String(grant.expiresAt) }, remaining: { N: String(maximum) }, maximum: { N: String(maximum) } }, ConditionExpression: "attribute_not_exists(#s) OR expiresAt <= :now", ExpressionAttributeNames: { "#s": "scope" }, ExpressionAttributeValues: { ":now": { N: String(seconds()) } } }));
  return grant;
}
async function ownedUnit(user: User, grant: FactoryGrant, deviceId: string): Promise<FactoryUnit | null> {
  const { Item } = await dynamoClient.send(new GetItemCommand({ TableName: access, Key: unitKey(grant.batchId, deviceId), ConsistentRead: true }));
  if (!Item) return null;
  const device = await getDevice(deviceId);
  if (!device || device.ownerId !== user.userId || device.orgId !== user.orgId || device.ownershipVersion !== Item.ownershipVersion.S) throw new FactoryError("Device ownership changed. Contact Peter before continuing.");
  return unit(Item);
}
function grantCheck(user: User, grant: FactoryGrant) {
  return { TableName: access, Key: grantKey(user.userId), ConditionExpression: "batchId = :batch AND expiresAt > :now AND attribute_not_exists(revokedAt)", ExpressionAttributeValues: { ":batch": { S: grant.batchId }, ":now": { N: String(seconds()) } } };
}
function deviceCheck(user: User, value: FactoryUnit) {
  return { TableName: devices, Key: { deviceId: { S: value.deviceId } }, ConditionExpression: "ownerId = :owner AND orgId = :org AND ownershipVersion = :version", ExpressionAttributeValues: { ":owner": { S: user.userId }, ":org": { S: user.orgId }, ":version": { S: value.ownershipVersion } } };
}
export async function enrollFactoryUnit(user: User, deviceId: string): Promise<FactoryUnit> {
  validateFactoryDeviceId(deviceId);
  const grant = await getFactoryGrant(user.userId);
  const previous = await ownedUnit(user, grant, deviceId);
  if (previous) return previous;
  const value: FactoryUnit = { deviceId, ownershipVersion: randomUUID(), createdAt: new Date().toISOString(), sessionId: null, keyId: null, configuredAt: null };
  try {
    await dynamoClient.send(new TransactWriteItemsCommand({ TransactItems: [
      { Update: { ...grantCheck(user, grant), UpdateExpression: "SET remaining = remaining - :one", ConditionExpression: `${grantCheck(user, grant).ConditionExpression} AND remaining > :zero`, ExpressionAttributeValues: { ...grantCheck(user, grant).ExpressionAttributeValues, ":one": { N: "1" }, ":zero": { N: "0" } } } },
      { Update: { TableName: devices, Key: { deviceId: { S: deviceId } }, UpdateExpression: "SET ownerId = :owner, orgId = :org, ownershipVersion = :version, #n = :name, visibility = :private, #status = :status, createdAt = :created, factoryBatch = :batch REMOVE enrollmentHash, enrollmentExpiresAt", ConditionExpression: "attribute_not_exists(deviceId) OR ((attribute_not_exists(ownerId) OR ownerId = :empty) AND factoryBatch = :batch)", ExpressionAttributeNames: { "#n": "name", "#status": "status" }, ExpressionAttributeValues: { ":owner": { S: user.userId }, ":org": { S: user.orgId }, ":version": { S: value.ownershipVersion }, ":name": { S: "Factory BME280 + dual ADC" }, ":private": { S: "private" }, ":status": { S: "provisioning" }, ":created": { S: value.createdAt }, ":batch": { S: grant.batchId }, ":empty": { S: "" } } } },
      { Put: { TableName: access, Item: { ...unitKey(grant.batchId, deviceId), deviceId: { S: deviceId }, ownershipVersion: { S: value.ownershipVersion }, createdAt: { S: value.createdAt } }, ConditionExpression: "attribute_not_exists(#s)", ExpressionAttributeNames: { "#s": "scope" } } },
    ] }));
  } catch (error) {
    if (!(error instanceof TransactionCanceledException)) throw error;
    const retry = await ownedUnit(user, grant, deviceId);
    if (retry) return retry;
    throw new FactoryError("Unit not enrolled. It may already be registered, or the factory quota/access changed. Contact Peter.");
  }
  return value;
}
export async function configureFactoryUnit(user: User, deviceId: string) {
  validateFactoryDeviceId(deviceId);
  const grant = await getFactoryGrant(user.userId), previous = await ownedUnit(user, grant, deviceId);
  if (!previous) throw new FactoryError("Enroll this unit before configuring it.", 404);
  const prepared = prepareApiKey({ name: "Factory USB upload", userId: user.userId, orgId: user.orgId, scopes: ["write:readings"], deviceId });
  const sessionId = randomUUID(), configuredAt = new Date().toISOString();
  const expected = previous.keyId ? "keyId = :old" : "attribute_not_exists(keyId)";
  try {
    await dynamoClient.send(new TransactWriteItemsCommand({ TransactItems: [
      { ConditionCheck: grantCheck(user, grant) }, { ConditionCheck: deviceCheck(user, previous) },
      { Update: { TableName: access, Key: unitKey(grant.batchId, deviceId), UpdateExpression: "SET keyId = :key, sessionId = :session, configuredAt = :at", ConditionExpression: `ownershipVersion = :version AND ${expected}`, ExpressionAttributeValues: { ":version": { S: previous.ownershipVersion }, ":key": { S: prepared.record.id }, ":session": { S: sessionId }, ":at": { S: configuredAt }, ...(previous.keyId ? { ":old": { S: previous.keyId } } : {}) } } },
      { Put: { TableName: keys, Item: prepared.item, ConditionExpression: "attribute_not_exists(id)" } },
      ...(previous.keyId ? [{ Update: { TableName: keys, Key: { id: { S: previous.keyId } }, UpdateExpression: "SET revokedAt = :at", ConditionExpression: "userId = :owner AND deviceId = :device", ExpressionAttributeValues: { ":at": { S: configuredAt }, ":owner": { S: user.userId }, ":device": { S: deviceId } } } }] : []),
    ] }));
  } catch (error) {
    if (!(error instanceof TransactionCanceledException)) throw error;
    throw new FactoryError("Configuration changed in another session. Reconnect this unit and try again.");
  }
  // Returned once, kept in browser memory only, and never saved in a factory report.
  return { key: prepared.key, sessionId, configuredAt };
}
export async function factoryUnit(user: User, deviceId: string) {
  validateFactoryDeviceId(deviceId);
  const grant = await getFactoryGrant(user.userId), value = await ownedUnit(user, grant, deviceId);
  if (!value) throw new FactoryError("Factory unit not found", 404);
  return value;
}
export async function listFactoryUnits(user: User) {
  const grant = await getFactoryGrant(user.userId);
  const { Items } = await dynamoClient.send(new QueryCommand({ TableName: access, KeyConditionExpression: "#s = :s AND begins_with(entry, :device)", ExpressionAttributeNames: { "#s": "scope" }, ExpressionAttributeValues: { ":s": { S: `factory-batch:${grant.batchId}` }, ":device": { S: "device:" } }, ConsistentRead: true, Limit: 100 }));
  const current = await Promise.all((Items ?? []).map(row => ownedUnit(user, grant, row.deviceId.S!)));
  return { grant, units: current.filter(value => value !== null) };
}
/** Receipt must belong to this freshly configured session, not an earlier successful test. */
export function factoryReceipt(value: FactoryUnit, reading: Reading | null) {
  if (!reading || reading.deviceId !== value.deviceId || !value.sessionId || !value.configuredAt || reading.factorySessionId !== value.sessionId || !reading.receivedAt || !Number.isFinite(Date.parse(reading.receivedAt)) || Date.parse(reading.receivedAt) < Date.parse(value.configuredAt)) return null;
  const within = (n: number | null, min: number, max: number) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const sensorsValid = reading.bmeValid === true && within(reading.temperature, -40, 85) && within(reading.humidity, 0, 100) && within(reading.pressure, 300, 1100) && within(reading.adcD3Raw, 0, 4095) && within(reading.adcD2Raw, 0, 4095);
  return { receivedAt: reading.receivedAt, capturedAt: reading.capturedAt, bootSession: reading.bootSession ?? null, sensorsValid, temperature: reading.temperature, humidity: reading.humidity, pressure: reading.pressure, adcD3Raw: reading.adcD3Raw, adcD2Raw: reading.adcD2Raw, firmwareVersion: reading.firmwareVersion, sample: reading.sample };
}
