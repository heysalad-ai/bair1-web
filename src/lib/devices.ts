import { storageTable } from "./storage-config";
import {
  DeleteItemCommand,
  ConditionalCheckFailedException,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";

const TABLE = storageTable("bair1-devices");

export type DeviceStatus = "active" | "inactive" | "provisioning";

export interface Device {
  deviceId: string;
  name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  ownerId: string;
  orgId: string;
  status: DeviceStatus;
  createdAt: string;
}

function text(item: Record<string, AttributeValue>, key: string) {
  return item[key]?.S ?? "";
}

function number(item: Record<string, AttributeValue>, key: string) {
  const value = item[key]?.N;
  return value == null ? null : Number(value);
}

function parseItem(item: Record<string, AttributeValue>): Device {
  return {
    deviceId: text(item, "deviceId"),
    name: text(item, "name"),
    location: text(item, "location"),
    lat: number(item, "lat"),
    lng: number(item, "lng"),
    ownerId: text(item, "ownerId"),
    orgId: text(item, "orgId") || "default",
    status: (text(item, "status") as DeviceStatus) || "inactive",
    createdAt: text(item, "createdAt"),
  };
}

async function scanDevices(filter?: { expression: string; values: Record<string, AttributeValue> }) {
  const devices: Device[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: exclusiveStartKey,
      ...(filter ? { FilterExpression: filter.expression, ExpressionAttributeValues: filter.values } : {}),
    }));
    devices.push(...(result.Items ?? []).map(parseItem));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return devices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDevice(deviceId: string): Promise<Device | null> {
  const result = await dynamoClient.send(new GetItemCommand({
    TableName: TABLE,
    Key: { deviceId: { S: deviceId } },
    ConsistentRead: true,
  }));
  return result.Item ? parseItem(result.Item) : null;
}

export async function createDevice(device: Device, onlyIfAbsent = false): Promise<void> {
  const item: Record<string, AttributeValue> = {
    deviceId: { S: device.deviceId },
    name: { S: device.name },
    location: { S: device.location },
    ownerId: { S: device.ownerId },
    orgId: { S: device.orgId },
    status: { S: device.status },
    createdAt: { S: device.createdAt || new Date().toISOString() },
  };
  if (device.lat != null) item.lat = { N: String(device.lat) };
  if (device.lng != null) item.lng = { N: String(device.lng) };
  await dynamoClient.send(new PutItemCommand({ TableName: TABLE, Item: item, ...(onlyIfAbsent ? { ConditionExpression: "attribute_not_exists(deviceId)" } : {}) }));
}

/** First writer owns an auto-registered device; competing ingestion must never replace its owner. */
export async function claimDeviceForReading(device: Device): Promise<Device> {
  try { await createDevice(device, true); }
  catch (error) { if (!(error instanceof ConditionalCheckFailedException)) throw error; }
  const existing = await getDevice(device.deviceId);
  if (!existing) throw new Error("device registration unavailable");
  return existing;
}

export async function updateDevice(
  deviceId: string,
  updates: Partial<Pick<Device, "name" | "location" | "lat" | "lng" | "status" | "ownerId">>,
): Promise<void> {
  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};
  const textFields = ["name", "location", "status", "ownerId"] as const;
  for (const field of textFields) {
    const value = updates[field];
    if (value !== undefined) {
      const name = `#${field}`;
      const token = `:${field}`;
      expressions.push(`${name} = ${token}`);
      names[name] = field;
      values[token] = { S: String(value) };
    }
  }
  for (const field of ["lat", "lng"] as const) {
    const value = updates[field];
    if (value !== undefined) {
      expressions.push(`${field} = :${field}`);
      values[`:${field}`] = value == null ? { NULL: true } : { N: String(value) };
    }
  }
  if (!expressions.length) return;
  await dynamoClient.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { deviceId: { S: deviceId } },
    UpdateExpression: `SET ${expressions.join(", ")}`,
    ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    ExpressionAttributeValues: values,
  }));
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await dynamoClient.send(new DeleteItemCommand({ TableName: TABLE, Key: { deviceId: { S: deviceId } } }));
}

export async function getAllDevicesRegistry(): Promise<Device[]> {
  return scanDevices();
}

export async function getDevicesForUser(userId: string): Promise<Device[]> {
  return scanDevices({ expression: "ownerId = :userId", values: { ":userId": { S: userId } } });
}

export async function getDevicesForOrg(orgId: string): Promise<Device[]> {
  return scanDevices({ expression: "orgId = :orgId", values: { ":orgId": { S: orgId } } });
}
