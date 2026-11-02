import { boundedRange } from "./measurement-contract";
import { getDevice, getAllDevicesRegistry } from "./devices";
import { storageTable } from "./storage-config";
import {
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
  ConditionalCheckFailedException,
  type AttributeValue,
  type QueryCommandInput,
  type ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";

import { persistReading, type IngestionIdentity, type IngestionResult } from "./reading-ingestion";

const TABLE = storageTable("bair1-readings");

export interface Reading {
  deviceId: string;
  timestamp: string;
  capturedAt: string | null;
  receivedAt: string | null;
  clockQuality: "device" | "gateway" | "unknown";
  altitudeMeters: number | null;
  adcD3Raw: number | null;
  adcD2Raw: number | null;
  adcD3PinVoltage: number | null;
  adcD2PinVoltage: number | null;
  adcD3InputVoltage: number | null;
  adcD2InputVoltage: number | null;
  aqi: number | null;
  gasRaw: number | null;
  gasVoltage: number | null;
  airState: string | null;
  rssi: number | null;
  firmwareVersion: string | null;
  uptimeMs: number | null;
  sample: number | null;
  transport: string | null;
  lat: number | null;
  lng: number | null;
  locationAccuracy: number | null;
  pm1: number | null;
  pm25: number | null;
  pm4: number | null;
  pm10: number | null;
  sensorModel: string | null;
  board: string | null;
  // Extended sensor fields (Genesis Mini multi-sensor)
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  dhtTemp: number | null;
  dhtHum: number | null;
  accelX: number | null;
  accelY: number | null;
  accelZ: number | null;
  gyroX: number | null;
  gyroY: number | null;
  gyroZ: number | null;
  batteryVoltage: number | null;
  batteryLevel: number | null;
}

export type ReadingInput = Omit<
  Reading,
  | "timestamp" | "capturedAt" | "receivedAt" | "clockQuality"
  | "altitudeMeters" | "adcD3Raw" | "adcD2Raw" | "adcD3PinVoltage" | "adcD2PinVoltage" | "adcD3InputVoltage" | "adcD2InputVoltage"
  | "lat" | "lng" | "locationAccuracy"
  | "pm1" | "pm25" | "pm4" | "pm10"
  | "sensorModel" | "board"
  | "temperature" | "humidity" | "pressure"
  | "dhtTemp" | "dhtHum"
  | "accelX" | "accelY" | "accelZ"
  | "gyroX" | "gyroY" | "gyroZ"
  | "batteryVoltage" | "batteryLevel"
> & {
  rawPayload: Record<string, unknown>;
  timestamp?: string;
} & IngestionIdentity;

type StoredReading = {
  deviceId: string;
  timestamp: string;
  rawPayload: Record<string, unknown>;
};

function text(item: Record<string, AttributeValue>, key: string): string | null {
  return item[key]?.S ?? null;
}

function number(item: Record<string, AttributeValue>, key: string): number | null {
  const value = item[key]?.N;
  return value == null ? null : Number(value);
}

function parseRawPayload(item: Record<string, AttributeValue>): Record<string, unknown> {
  const value = text(item, "rawPayload");
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function rawNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}

function parseItem(item: Record<string, AttributeValue>): Reading {
  const raw = parseRawPayload(item);
  return {
    deviceId: text(item, "physicalDeviceId") ?? text(item, "deviceId") ?? "unknown",
    timestamp: text(item, "readingAt") ?? text(item, "timestamp") ?? "",
    capturedAt: text(item, "capturedAt"),
    receivedAt: text(item, "receivedAt"),
    clockQuality: (text(item, "clockQuality") ?? "unknown") as Reading["clockQuality"],
    altitudeMeters: rawNumber(raw, "altitudeMeters"),
    adcD3Raw: rawNumber(raw, "adcD3Raw"),
    adcD2Raw: rawNumber(raw, "adcD2Raw"),
    adcD3PinVoltage: rawNumber(raw, "adcD3PinVoltage"),
    adcD2PinVoltage: rawNumber(raw, "adcD2PinVoltage"),
    adcD3InputVoltage: rawNumber(raw, "adcD3InputVoltage"),
    adcD2InputVoltage: rawNumber(raw, "adcD2InputVoltage"),
    aqi: number(item, "aqi"),
    gasRaw: number(item, "gasRaw"),
    gasVoltage: number(item, "gasVoltage"),
    airState: text(item, "airState"),
    rssi: number(item, "rssi"),
    firmwareVersion: text(item, "firmwareVersion"),
    uptimeMs: number(item, "uptimeMs"),
    sample: number(item, "sample"),
    transport: text(item, "transport"),
    lat: rawNumber(raw, "lat"),
    lng: rawNumber(raw, "lng"),
    locationAccuracy: rawNumber(raw, "locationAccuracy"),
    pm1: rawNumber(raw, "pm1"),
    pm25: rawNumber(raw, "pm25"),
    pm4: rawNumber(raw, "pm4"),
    pm10: rawNumber(raw, "pm10"),
    sensorModel: raw.sensorModel ? String(raw.sensorModel) : null,
    board: raw.board ? String(raw.board) : null,
    // Extended sensor fields (Genesis Mini multi-sensor)
    temperature: rawNumber(raw, "temperature"),
    humidity: rawNumber(raw, "humidity"),
    pressure: raw.transport === "notehub" && raw.pressureUnit !== "hPa" ? null : rawNumber(raw, "pressure"),
    dhtTemp: rawNumber(raw, "dhtTemp"),
    dhtHum: rawNumber(raw, "dhtHum"),
    accelX: rawNumber(raw, "accelX"),
    accelY: rawNumber(raw, "accelY"),
    accelZ: rawNumber(raw, "accelZ"),
    gyroX: rawNumber(raw, "gyroX"),
    gyroY: rawNumber(raw, "gyroY"),
    gyroZ: rawNumber(raw, "gyroZ"),
    batteryVoltage: rawNumber(raw, "batteryVoltage"),
    batteryLevel: rawNumber(raw, "batteryLevel"),
  };
}

async function queryAll(input: QueryCommandInput, limit?: number) {
  const items: Record<string, AttributeValue>[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }),
    );
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey && (!limit || items.length < limit));

  return limit ? items.slice(0, limit) : items;
}

async function scanAll(input: ScanCommandInput) {
  const items: Record<string, AttributeValue>[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;

  do {
    const result = await dynamoClient.send(
      new ScanCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }),
    );
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

export async function getReadings(deviceId: string, limit = 100): Promise<Reading[]> {
  const version = (await getDevice(deviceId))?.ownershipVersion;
  const items = await queryAll({
    TableName: TABLE,
    KeyConditionExpression: "deviceId = :deviceId",
    ExpressionAttributeValues: { ":deviceId": { S: version && version !== "legacy" ? `${deviceId}#${version}` : deviceId } },
    ScanIndexForward: false,
    Limit: Math.min(Math.max(limit, 1), 10_000),
  }, limit);
  return items.map(parseItem);
}

export async function getLatestReading(deviceId: string): Promise<Reading | null> {
  const readings = await getReadings(deviceId, 1);
  return readings[0] ?? null;
}

export async function getAllDevices(): Promise<string[]> {
  return (await getAllDevicesRegistry()).filter(device => device.status === "active").map(device => device.deviceId);
}

export async function getLatestReadings(limit = 20): Promise<Reading[]> {
  const latest = await Promise.all((await getAllDevices()).map((deviceId) => getLatestReading(deviceId)));
  return latest
    .filter((reading): reading is Reading => Boolean(reading))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export async function getReadingsInRange(deviceId: string, from: string, to: string, limit = 10000): Promise<Reading[]> {
  const range = boundedRange(from, to);
  limit = Math.min(Math.max(Math.floor(limit), 1), 10000);
  const version = (await getDevice(deviceId))?.ownershipVersion;
  const items = await queryAll({
    TableName: TABLE,
    KeyConditionExpression: "deviceId = :deviceId AND #timestamp BETWEEN :from AND :to",
    ExpressionAttributeNames: { "#timestamp": "timestamp" },
    ExpressionAttributeValues: {
      ":deviceId": { S: version && version !== "legacy" ? `${deviceId}#${version}` : deviceId },
      ":from": { S: range.from },
      ":to": { S: range.to + "~" },
    },
    Limit: Math.min(limit, 1000),
    ScanIndexForward: false,
  }, limit);
  return items.map(parseItem).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getReadingPage(deviceId: string, options: { limit?: number; cursor?: string | null; from?: string | null; to?: string | null } = {}) {
  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new RangeError("Page limit must be a positive integer");
  const limit = Math.min(options.limit ?? 200, 500);
  const version = (await getDevice(deviceId))?.ownershipVersion;
  const partition = version && version !== "legacy" ? `${deviceId}#${version}` : deviceId;
  if (Boolean(options.from) !== Boolean(options.to)) throw new RangeError("Both range dates are required");
  const range = options.from && options.to ? boundedRange(options.from, options.to) : null;
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  if (options.cursor) {
    try {
      if (options.cursor.length > 1500) throw new Error();
      const cursor = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8"));
      if (cursor.deviceId !== partition || cursor.from !== (range?.from ?? null) || cursor.to !== (range?.to ?? null)
        || typeof cursor.timestamp !== "string" || cursor.timestamp.length > 200) throw new Error();
      exclusiveStartKey = { deviceId: { S: partition }, timestamp: { S: cursor.timestamp } };
    } catch { throw new RangeError("Pagination cursor does not match this device and range"); }
  }
  const result = await dynamoClient.send(new QueryCommand({ TableName: TABLE, Limit: limit, ScanIndexForward: false, ExclusiveStartKey: exclusiveStartKey,
    KeyConditionExpression: range ? "deviceId = :d AND #t BETWEEN :f AND :t" : "deviceId = :d",
    ...(range ? { ExpressionAttributeNames: { "#t": "timestamp" } } : {}),
    ExpressionAttributeValues: { ":d": { S: partition }, ...(range ? { ":f": { S: range.from }, ":t": { S: range.to + "~" } } : {}) },
  }));
  const nextCursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify({ deviceId: partition, timestamp: result.LastEvaluatedKey.timestamp.S,
    from: range?.from ?? null, to: range?.to ?? null })).toString("base64url") : null;
  return { data: (result.Items ?? []).map(parseItem), nextCursor, limit };
}

export async function storeReading(input: ReadingInput): Promise<IngestionResult> {
  const item: Record<string, AttributeValue> = {
    deviceId: { S: input.ownershipVersion && input.ownershipVersion !== "legacy" ? `${input.deviceId}#${input.ownershipVersion}` : input.deviceId },
    physicalDeviceId: { S: input.deviceId },
    rawPayload: { S: JSON.stringify(input.rawPayload) },
  };
  const optionalNumbers = {
    aqi: input.aqi,
    gasRaw: input.gasRaw,
    gasVoltage: input.gasVoltage,
    rssi: input.rssi,
    uptimeMs: input.uptimeMs,
    sample: input.sample,
  };
  for (const [key, value] of Object.entries(optionalNumbers)) {
    if (value != null) item[key] = { N: String(value) };
  }
  const optionalText = {
    airState: input.airState,
    firmwareVersion: input.firmwareVersion,
    transport: input.transport,
  };
  for (const [key, value] of Object.entries(optionalText)) {
    if (value) item[key] = { S: value };
  }

  return persistReading(item, input.rawPayload, {
    ...input,
    capturedAt: input.capturedAt ?? input.timestamp ?? null,
  });
}

export async function getReadingsMissingLocation(): Promise<StoredReading[]> {
  const items = await scanAll({ TableName: TABLE, ProjectionExpression: "deviceId, #timestamp, rawPayload", ExpressionAttributeNames: { "#timestamp": "timestamp" } });
  return items
    .map((item) => ({
      deviceId: text(item, "deviceId") ?? "",
      timestamp: text(item, "timestamp") ?? "",
      rawPayload: parseRawPayload(item),
    }))
    .filter(({ rawPayload }) => rawPayload.cellTower && rawPayload.lat == null && rawPayload.lng == null);
}

export async function updateReadingRawPayload(reading: StoredReading): Promise<void> {
  await dynamoClient.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: {
      deviceId: { S: reading.deviceId },
      timestamp: { S: reading.timestamp },
    },
    UpdateExpression: "SET rawPayload = :rawPayload",
    ExpressionAttributeValues: { ":rawPayload": { S: JSON.stringify(reading.rawPayload) } },
  }));
}

// ---------- Device command queue ----------
// Table: bair1-commands. PK: deviceId, SK: commandId (sortable ISO-ish).
// TTL 1 hour. Each command: {deviceId, commandId, type, payload, status, result, createdAt, expiresAt}.

const COMMANDS_TABLE = storageTable("bair1-commands");
const COMMAND_TTL_SECONDS = 60 * 60;

export type CommandType =
  | "set_led"
  | "read_sps30"
  | "clean_sps30"
  | "reboot"
  | "get_state";

export interface Command {
  deviceId: string;
  commandId: string;
  type: CommandType;
  payload: Record<string, unknown> | null;
  status: "pending" | "done";
  result: Record<string, unknown> | null;
  createdAt: string;
  expiresAt: number;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

async function ownershipKey(deviceId: string, key: string) {
  const version = (await getDevice(deviceId))?.ownershipVersion;
  return version && version !== "legacy" ? `${key}#${version}` : key;
}

export async function enqueueCommand(
  deviceId: string,
  type: CommandType,
  payload: Record<string, unknown> | null = null,
): Promise<Command> {
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const prefix = await ownershipKey(deviceId, "command");
  const commandId = `${prefix}#${now.toString(36)}-${randomId("cmd")}`;
  const expiresAt = Math.floor(now / 1000) + COMMAND_TTL_SECONDS;
  const item: Record<string, AttributeValue> = {
    deviceId: { S: deviceId },
    commandId: { S: commandId },
    type: { S: type },
    status: { S: "pending" },
    createdAt: { S: createdAt },
    expiresAt: { N: String(expiresAt) },
  };
  if (payload) item.payload = { S: JSON.stringify(payload) };

  await dynamoClient.send(new PutItemCommand({ TableName: COMMANDS_TABLE, Item: item }));
  return {
    deviceId,
    commandId,
    type,
    payload,
    status: "pending",
    result: null,
    createdAt,
    expiresAt,
  };
}

export async function pollCommands(deviceId: string, limit = 10): Promise<Command[]> {
  const prefix = await ownershipKey(deviceId, "command");
  const versioned = prefix !== "command";
  const items = await queryAll({
    TableName: COMMANDS_TABLE,
    KeyConditionExpression: versioned ? "deviceId = :deviceId AND begins_with(commandId, :prefix)" : "deviceId = :deviceId",
    ExpressionAttributeValues: { ":deviceId": { S: deviceId }, ":pending": { S: "pending" }, ":now": { N: String(Math.floor(Date.now() / 1000)) }, ...(versioned ? { ":prefix": { S: prefix + "#" } } : {}) },
    FilterExpression: "#status = :pending AND expiresAt > :now",
    ExpressionAttributeNames: { "#status": "status" },
    ScanIndexForward: true,
    Limit: Math.min(Math.max(limit, 1), 50),
  }, limit);

  return items
    .map(parseCommandItem)
    .filter((cmd): cmd is Command => cmd !== null && cmd.status === "pending" && cmd.expiresAt > Date.now() / 1000);
}

export async function ackCommand(
  deviceId: string,
  commandId: string,
  ok: boolean,
  result: Record<string, unknown> | null = null,
): Promise<void> {
  const updateExpression = "SET #status = :status, result = :result";
  const names = { "#status": "status" };
  const values: Record<string, AttributeValue> = {
    ":status": { S: ok ? "done" : "done" },
    ":result": { S: JSON.stringify({ ok, ...(result ?? {}) }) },
  };
  await dynamoClient.send(new UpdateItemCommand({
    TableName: COMMANDS_TABLE,
    Key: {
      deviceId: { S: deviceId },
      commandId: { S: commandId },
    },
    UpdateExpression: updateExpression,
    ConditionExpression: "attribute_exists(commandId)",
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function getCommand(deviceId: string, commandId: string): Promise<Command | null> {
  const prefix = await ownershipKey(deviceId, "command");
  if (prefix !== "command" && !commandId.startsWith(prefix + "#")) return null;
  const result = await dynamoClient.send(new QueryCommand({
    TableName: COMMANDS_TABLE,
    KeyConditionExpression: "deviceId = :deviceId AND commandId = :commandId",
    ExpressionAttributeValues: {
      ":deviceId": { S: deviceId },
      ":commandId": { S: commandId },
    },
    Limit: 1,
  }));
  const item = result.Items?.[0];
  return item ? parseCommandItem(item) : null;
}

function parseCommandItem(item: Record<string, AttributeValue>): Command | null {
  const deviceId = item["deviceId"]?.S;
  const commandId = item["commandId"]?.S;
  const type = item["type"]?.S as CommandType | undefined;
  if (!deviceId || !commandId || !type) return null;
  let payload: Record<string, unknown> | null = null;
  const payloadRaw = item["payload"]?.S;
  if (payloadRaw) {
    try {
      const parsed: unknown = JSON.parse(payloadRaw);
      payload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch { /* ignore */ }
  }
  let result: Record<string, unknown> | null = null;
  const resultRaw = item["result"]?.S;
  if (resultRaw) {
    try {
      const parsed: unknown = JSON.parse(resultRaw);
      result = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch { /* ignore */ }
  }
  return {
    deviceId,
    commandId,
    type,
    payload,
    status: (item["status"]?.S as "pending" | "done") ?? "pending",
    result,
    createdAt: item["createdAt"]?.S ?? "",
    expiresAt: Number(item["expiresAt"]?.N ?? 0),
  };
}

// ---------- Device state (lightweight LED + last-seen) ----------
// Stored in COMMANDS_TABLE under PK=deviceId, SK=`state#latest` so we avoid
// creating a fourth table. Small, hot, overwritten on each ack/state update.

const STATE_SORT_KEY = "state#latest";

export interface DeviceState {
  deviceId: string;
  led: { on: boolean; brightness: number };
  lastSeenAt: string | null;
  updatedAt: string;
}

export async function getDeviceState(deviceId: string): Promise<DeviceState> {
  const result = await dynamoClient.send(new QueryCommand({
    TableName: COMMANDS_TABLE,
    KeyConditionExpression: "deviceId = :deviceId AND commandId = :sk",
    ExpressionAttributeValues: {
      ":deviceId": { S: deviceId },
      ":sk": { S: await ownershipKey(deviceId, STATE_SORT_KEY) },
    },
    Limit: 1,
  }));
  const item = result.Items?.[0];
  if (!item) {
    return { deviceId, led: { on: false, brightness: 0 }, lastSeenAt: null, updatedAt: "" };
  }
  return {
    deviceId,
    led: {
      on: item["ledOn"]?.BOOL ?? false,
      brightness: Number(item["ledBrightness"]?.N ?? 0),
    },
    lastSeenAt: item["lastSeenAt"]?.S ?? null,
    updatedAt: item["updatedAt"]?.S ?? "",
  };
}

export async function setDeviceState(
  deviceId: string,
  led: { on: boolean; brightness: number },
  lastSeenAt: string | null = null,
): Promise<void> {
  const now = new Date().toISOString();
  const item: Record<string, AttributeValue> = {
    deviceId: { S: deviceId },
    commandId: { S: await ownershipKey(deviceId, STATE_SORT_KEY) },
    ledOn: { BOOL: led.on },
    ledBrightness: { N: String(led.brightness) },
    updatedAt: { S: now },
  };
  if (lastSeenAt) item.lastSeenAt = { S: lastSeenAt };
  await dynamoClient.send(new PutItemCommand({ TableName: COMMANDS_TABLE, Item: item }));
}

const NOTECARD_TELEMETRY_SORT_KEY = "telemetry#notecard#latest";
const NOTECARD_TELEMETRY_EVENT_PREFIX = "telemetry#notecard#event#";
const NOTECARD_HISTORY_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export interface NotecardTelemetry {
  deviceId: string;
  capturedAt: string;
  receivedAt: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  pressureUnit?: "hPa" | "unknown";
  measurementAt?: string | null;
  temperatureAt?: string | null;
  humidityAt?: string | null;
  pressureAt?: string | null;
  batteryVoltageAt?: string | null;
  motionAt?: string | null;
  batteryVoltage: number | null;
  motion: number | null;
  deviceStatus: string | null;
  transport: string | null;
  lat: number | null;
  lng: number | null;
  locationAccuracy: number | null;
  locationSource: string | null;
  sourceFile: string | null;
  updatedAt: string;
}

export async function setNotecardTelemetry(
  telemetry: Omit<NotecardTelemetry, "updatedAt">,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const heartbeatValues: Record<string, AttributeValue> = {
    ":capturedAt": { S: telemetry.capturedAt },
    ":receivedAt": { S: telemetry.receivedAt },
    ":updatedAt": { S: updatedAt },
  };
  const heartbeatNames: Record<string, string> = {};
  const heartbeatExpressions = [
    "capturedAt = :capturedAt",
    "receivedAt = :receivedAt",
    "updatedAt = :updatedAt",
  ];
  for (const [key, value] of Object.entries({
    lat: telemetry.lat,
    lng: telemetry.lng,
    locationAccuracy: telemetry.locationAccuracy,
  })) {
    if (value == null) continue;
    heartbeatNames[`#${key}`] = key;
    heartbeatValues[`:${key}`] = { N: String(value) };
    heartbeatExpressions.push(`#${key} = :${key}`);
  }
  for (const [key, value] of Object.entries({
    deviceStatus: telemetry.deviceStatus,
    transport: telemetry.transport,
    locationSource: telemetry.locationSource,
    sourceFile: telemetry.sourceFile,
  })) {
    if (!value) continue;
    heartbeatNames[`#${key}`] = key;
    heartbeatValues[`:${key}`] = { S: value };
    heartbeatExpressions.push(`#${key} = :${key}`);
  }
  const latestKey = {
    deviceId: { S: telemetry.deviceId },
    commandId: { S: await ownershipKey(telemetry.deviceId, NOTECARD_TELEMETRY_SORT_KEY) },
  };
  try {
    await dynamoClient.send(new UpdateItemCommand({
      TableName: COMMANDS_TABLE,
      Key: latestKey,
      UpdateExpression: `SET ${heartbeatExpressions.join(", ")}`,
      ...(Object.keys(heartbeatNames).length ? { ExpressionAttributeNames: heartbeatNames } : {}),
      ExpressionAttributeValues: heartbeatValues,
      ConditionExpression: "attribute_not_exists(capturedAt) OR capturedAt <= :capturedAt",
    }));
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
  }

  const measurements = {
    temperature: telemetry.temperature,
    humidity: telemetry.humidity,
    pressure: telemetry.pressure,
    batteryVoltage: telemetry.batteryVoltage,
    motion: telemetry.motion,
  };
  for (const [field, value] of Object.entries(measurements)) {
    if (value == null) continue;
    try {
      await dynamoClient.send(new UpdateItemCommand({ TableName: COMMANDS_TABLE, Key: latestKey,
        UpdateExpression: `SET #value = :value, #observed = :at, updatedAt = :now${field === "pressure" ? ", pressureUnit = :unit" : ""}`,
        ConditionExpression: "attribute_not_exists(#observed) OR #observed <= :at",
        ExpressionAttributeNames: { "#value": field, "#observed": `${field}At` },
        ExpressionAttributeValues: { ":value": { N: String(value) }, ":at": { S: telemetry.capturedAt }, ":now": { S: updatedAt },
          ...(field === "pressure" ? { ":unit": { S: telemetry.pressureUnit ?? "unknown" } } : {}) },
      }));
    } catch (error) { if (!(error instanceof ConditionalCheckFailedException)) throw error; }
  }

  const safeFile = (telemetry.sourceFile ?? "event").replace(/[^a-zA-Z0-9._-]/g, "_");
  const eventItem: Record<string, AttributeValue> = {
    deviceId: { S: telemetry.deviceId },
    commandId: {
      S: `${await ownershipKey(telemetry.deviceId, NOTECARD_TELEMETRY_EVENT_PREFIX)}#${telemetry.capturedAt}#${telemetry.receivedAt}#${safeFile}`,
    },
    capturedAt: { S: telemetry.capturedAt },
    receivedAt: { S: telemetry.receivedAt },
    updatedAt: { S: updatedAt },
    pressureUnit: { S: telemetry.pressureUnit ?? "unknown" },
    expiresAt: { N: String(Math.floor(Date.now() / 1000) + NOTECARD_HISTORY_RETENTION_SECONDS) },
  };
  for (const [key, value] of Object.entries({
    temperature: telemetry.temperature,
    humidity: telemetry.humidity,
    pressure: telemetry.pressure,
    batteryVoltage: telemetry.batteryVoltage,
    motion: telemetry.motion,
    lat: telemetry.lat,
    lng: telemetry.lng,
    locationAccuracy: telemetry.locationAccuracy,
  })) {
    if (value != null) { eventItem[key] = { N: String(value) }; eventItem[`${key}At`] = { S: telemetry.capturedAt }; }
  }
  for (const [key, value] of Object.entries({
    deviceStatus: telemetry.deviceStatus,
    transport: telemetry.transport,
    locationSource: telemetry.locationSource,
    sourceFile: telemetry.sourceFile,
  })) {
    if (value) eventItem[key] = { S: value };
  }
  await dynamoClient.send(new PutItemCommand({ TableName: COMMANDS_TABLE, Item: eventItem }));
}

function parseNotecardTelemetryItem(
  deviceId: string,
  item: Record<string, AttributeValue>,
): NotecardTelemetry {
  return {
    deviceId,
    capturedAt: item.capturedAt?.S ?? "",
    receivedAt: item.receivedAt?.S ?? "",
    temperature: item.temperature?.N == null ? null : Number(item.temperature.N),
    humidity: item.humidity?.N == null ? null : Number(item.humidity.N),
    pressure: item.pressure?.N == null ? null : Number(item.pressure.N),
    pressureUnit: item.pressureUnit?.S === "hPa" ? "hPa" : "unknown",
    measurementAt: ["temperature", "humidity", "pressure", "batteryVoltage", "motion"].map(field => item[`${field}At`]?.S).filter((value): value is string => Boolean(value)).sort().at(-1) ?? item.measurementAt?.S ?? null,
    temperatureAt: item.temperatureAt?.S ?? null,
    humidityAt: item.humidityAt?.S ?? null,
    pressureAt: item.pressureAt?.S ?? null,
    batteryVoltageAt: item.batteryVoltageAt?.S ?? null,
    motionAt: item.motionAt?.S ?? null,
    batteryVoltage: item.batteryVoltage?.N == null ? null : Number(item.batteryVoltage.N),
    motion: item.motion?.N == null ? null : Number(item.motion.N),
    deviceStatus: item.deviceStatus?.S ?? null,
    transport: item.transport?.S ?? null,
    lat: item.lat?.N == null ? null : Number(item.lat.N),
    lng: item.lng?.N == null ? null : Number(item.lng.N),
    locationAccuracy: item.locationAccuracy?.N == null ? null : Number(item.locationAccuracy.N),
    locationSource: item.locationSource?.S ?? null,
    sourceFile: item.sourceFile?.S ?? null,
    updatedAt: item.updatedAt?.S ?? "",
  };
}

export async function getNotecardTelemetry(deviceId: string): Promise<NotecardTelemetry | null> {
  const result = await dynamoClient.send(new QueryCommand({
    TableName: COMMANDS_TABLE,
    KeyConditionExpression: "deviceId = :deviceId AND commandId = :sk",
    ExpressionAttributeValues: {
      ":deviceId": { S: deviceId },
      ":sk": { S: await ownershipKey(deviceId, NOTECARD_TELEMETRY_SORT_KEY) },
    },
    Limit: 1,
  }));
  const item = result.Items?.[0];
  if (!item) return null;
  return parseNotecardTelemetryItem(deviceId, item);
}

export async function getNotecardTelemetryHistory(
  deviceId: string,
  limit = 120,
): Promise<NotecardTelemetry[]> {
  const result = await dynamoClient.send(new QueryCommand({
    TableName: COMMANDS_TABLE,
    KeyConditionExpression: "deviceId = :deviceId AND begins_with(commandId, :prefix)",
    ExpressionAttributeValues: {
      ":deviceId": { S: deviceId },
      ":prefix": { S: await ownershipKey(deviceId, NOTECARD_TELEMETRY_EVENT_PREFIX) },
    },
    ScanIndexForward: false,
    Limit: Math.min(Math.max(limit, 1), 500),
  }));
  return (result.Items ?? []).map((item) => parseNotecardTelemetryItem(deviceId, item));
}
