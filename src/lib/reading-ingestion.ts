import { storageTable } from "./storage-config";
import { createHash, randomUUID } from "node:crypto";
import {
  GetItemCommand, TransactWriteItemsCommand, TransactionCanceledException,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";

export const READING_RETENTION_SECONDS = 14 * 24 * 60 * 60;
export const EVENT_TABLE = storageTable("bair1-reading-events");
export type IngestionResult = {
  outcome: "stored" | "duplicate" | "conflict";
  timestamp: string;
  capturedAt: string | null;
  receivedAt: string;
  clockQuality: "device" | "gateway" | "unknown";
};
export type IngestionIdentity = {
  capturedAt?: string | number | null;
  eventId?: string | null;
  bootSession?: string | null;
  sequence?: string | number | null;
  capturedAtSource?: "device" | "gateway";
  authorizedOwnerId?: string;
};
export class InvalidReadingError extends Error {}

export function validateReadingBody(body: unknown): asserts body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidReadingError("expected a JSON object");
  const data = body as Record<string, unknown>;
  if (typeof data.deviceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(data.deviceId)) {
    throw new InvalidReadingError("invalid deviceId");
  }
  for (const field of ["eventId", "bootSession"]) {
    if (data[field] != null && (typeof data[field] !== "string" || !data[field].trim() || data[field].length > 256)) {
      throw new InvalidReadingError(`invalid ${field}`);
    }
  }
  if (data.sequence != null && !((typeof data.sequence === "string" && data.sequence.trim() && data.sequence.length <= 128)
    || (typeof data.sequence === "number" && Number.isSafeInteger(data.sequence) && data.sequence >= 0))) {
    throw new InvalidReadingError("invalid sequence");
  }
  for (const field of ["lat", "lng", "locationAccuracy", "aqi", "pm1", "pm25", "pm4", "pm10", "gasRaw", "gasVoltage", "rssi", "uptimeMs", "sample",
    "temperature", "humidity", "pressure", "altitudeMeters", "adcD3Raw", "adcD2Raw", "adcD3PinVoltage",
    "adcD2PinVoltage", "adcD3InputVoltage", "adcD2InputVoltage", "adcD3DividerGain", "adcD2DividerGain", "droppedSamples"]) {
    const value = data[field];
    if (value != null && (!(typeof value === "number" || typeof value === "string") || String(value).trim() === "" || !Number.isFinite(Number(value)))) {
      throw new InvalidReadingError(`invalid ${field}`);
    }
  }
}

// Stable across JSON object key order; arrays retain their order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function hash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function captureTime(value: unknown, now: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const millis = typeof value === "number" ? (value < 10_000_000_000 ? value * 1000 : value) : Date.parse(value);
  return Number.isFinite(millis) && millis >= Date.UTC(2020, 0, 1) && millis <= now + 86400000
    ? new Date(millis).toISOString() : null;
}

/** Atomic reading + event receipt: a timeout cannot acknowledge a half-write.
 * Stable producer identity is required for retry safety when no capture time exists.
 * The event receipt lives for the same retention window as its reading.
 */
export async function persistReading(
  item: Record<string, AttributeValue>, rawPayload: Record<string, unknown>, identity: IngestionIdentity,
): Promise<IngestionResult> {
  const now = Date.now();
  const receivedAt = new Date(now).toISOString();
  const capturedAt = captureTime(identity.capturedAt, now);
  const clockQuality = capturedAt ? identity.capturedAtSource ?? "device" : "unknown";
  // Operational counters/signal strength may change between attempts. First accepted values win.
  const immutable = { ...rawPayload };
  for (const key of ["rssi", "droppedSamples", "capturedAt", "measuredAt", "epochSeconds", "when"]) delete immutable[key];
  const fingerprint = hash({ payload: immutable, capturedAt });
  const producerIdentity = identity.eventId ? ["event", identity.eventId]
    : identity.bootSession && identity.sequence != null ? ["boot", identity.bootSession, String(identity.sequence)]
    : capturedAt ? ["content", capturedAt, fingerprint] : ["legacy", randomUUID()];
  const eventId = hash(producerIdentity);
  const timestamp = capturedAt ?? receivedAt;
  const result: IngestionResult = { outcome: "stored", timestamp, capturedAt, receivedAt, clockQuality };
  // A suffix allows distinct readings at the same instant. APIs expose readingAt, never this key.
  const readingKey = `${timestamp}#${eventId}`;
  const expiresAt = Math.floor(now / 1000) + READING_RETENTION_SECONDS;
  const receipt: Record<string, AttributeValue> = {
    deviceId: item.deviceId, eventId: { S: eventId }, fingerprint: { S: fingerprint },
    readingKey: { S: readingKey }, result: { S: JSON.stringify(result) }, expiresAt: { N: String(expiresAt) },
  };
  const reading = { ...item, timestamp: { S: readingKey }, readingAt: { S: timestamp },
    receivedAt: { S: receivedAt }, clockQuality: { S: clockQuality },
    ...(capturedAt ? { capturedAt: { S: capturedAt } } : {}), expiresAt: { N: String(expiresAt) } };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await dynamoClient.send(new TransactWriteItemsCommand({ TransactItems: [
        ...(identity.authorizedOwnerId ? [{ ConditionCheck: {
          TableName: storageTable("bair1-devices"), Key: { deviceId: item.deviceId },
          ConditionExpression: "ownerId = :owner", ExpressionAttributeValues: { ":owner": { S: identity.authorizedOwnerId } },
        } }] : []),
        { Put: { TableName: storageTable("bair1-readings"), Item: reading,
          ConditionExpression: "attribute_not_exists(deviceId) AND attribute_not_exists(#ts)", ExpressionAttributeNames: { "#ts": "timestamp" } } },
        { Put: { TableName: EVENT_TABLE, Item: receipt,
          ConditionExpression: "attribute_not_exists(deviceId) AND attribute_not_exists(eventId)" } },
      ] }));
      return result;
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      if (identity.authorizedOwnerId && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") throw error;
      const existing = (await dynamoClient.send(new GetItemCommand({ TableName: EVENT_TABLE,
        Key: { deviceId: item.deviceId, eventId: { S: eventId } }, ConsistentRead: true }))).Item;
      if (existing) {
        const previous = JSON.parse(existing.result.S!) as IngestionResult;
        return { ...previous, outcome: existing.fingerprint.S === fingerprint ? "duplicate" : "conflict" };
      }
      // A concurrent transaction may still be committing. Retry briefly, otherwise let the client retry.
      if (attempt === 3 || error.CancellationReasons?.some((r) => r.Code && !["None", "TransactionConflict"].includes(r.Code))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
  throw new Error("ingestion retry exhausted");
}
