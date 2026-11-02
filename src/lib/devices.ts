import { registryCondition } from "./registry-condition";
import { storageTable } from "./storage-config";
import {
  DeleteItemCommand,
  ConditionalCheckFailedException,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  QueryCommand,
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
  visibility?: "private" | "workspace" | "public";
  ownershipVersion?: string;
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
    visibility: (["workspace", "public"].includes(text(item, "visibility"))
      ? text(item, "visibility")
      : "private") as Device["visibility"],
    ownershipVersion: text(item, "ownershipVersion") || "legacy",
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

async function scanDevices(filter?: {
  expression: string;
  values: Record<string, AttributeValue>;
}) {
  const devices: Device[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  let scanned = 0;
  do {
    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: TABLE,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: 200,
        ...(filter
          ? {
              FilterExpression: filter.expression,
              ExpressionAttributeValues: filter.values,
            }
          : {}),
      }),
    );
    devices.push(...(result.Items ?? []).map(parseItem));
    if (devices.length > 1000)
      throw new Error(
        "Registry listing exceeds 1000 devices; use indexed access",
      );
    scanned += result.ScannedCount ?? 0;
    if (scanned >= 1000 && result.LastEvaluatedKey)
      throw new Error(
        "Registry scan exceeds safety limit; configure indexed access",
      );
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return devices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDevice(deviceId: string): Promise<Device | null> {
  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { deviceId: { S: deviceId } },
      ConsistentRead: true,
    }),
  );
  return result.Item ? parseItem(result.Item) : null;
}

export async function createDevice(
  device: Device,
  onlyIfAbsent = false,
): Promise<void> {
  const item: Record<string, AttributeValue> = {
    deviceId: { S: device.deviceId },
    visibility: { S: device.visibility ?? "private" },
    ownershipVersion: { S: device.ownershipVersion ?? "legacy" },
    name: { S: device.name },
    location: { S: device.location },
    ...(device.ownerId ? { ownerId: { S: device.ownerId } } : {}),
    ...(device.orgId ? { orgId: { S: device.orgId } } : {}),
    status: { S: device.status },
    createdAt: { S: device.createdAt || new Date().toISOString() },
  };
  if (device.lat != null) item.lat = { N: String(device.lat) };
  if (device.lng != null) item.lng = { N: String(device.lng) };
  await dynamoClient.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: item,
      ...(onlyIfAbsent
        ? { ConditionExpression: "attribute_not_exists(deviceId)" }
        : {}),
    }),
  );
}

/** First writer owns an auto-registered device; competing ingestion must never replace its owner. */
export async function claimDeviceForReading(device: Device): Promise<Device> {
  try {
    await createDevice(device, true);
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
  }
  const existing = await getDevice(device.deviceId);
  if (!existing) throw new Error("device registration unavailable");
  return existing;
}

export async function updateDevice(
  deviceId: string,
  updates: Partial<
    Pick<
      Device,
      "name" | "location" | "lat" | "lng" | "status" | "visibility" | "orgId"
    >
  >,
  expectedDevice?: Device,
): Promise<void> {
  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};
  const textFields = [
    "name",
    "location",
    "status",
    "visibility",
    "orgId",
  ] as const;
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
      values[`:${field}`] =
        value == null ? { NULL: true } : { N: String(value) };
    }
  }
  if (!expressions.length) return;
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { deviceId: { S: deviceId } },
      UpdateExpression: `SET ${expressions.join(", ")}`,
      ConditionExpression: expectedDevice
        ? registryCondition(expectedDevice).ConditionExpression
        : "attribute_exists(deviceId)",
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: {
        ...values,
        ...(expectedDevice
          ? registryCondition(expectedDevice).ExpressionAttributeValues
          : {}),
      },
    }),
  );
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: { deviceId: { S: deviceId } },
    }),
  );
}

export async function getAllDevicesRegistry(): Promise<Device[]> {
  return scanDevices();
}

export async function getDevicesForUser(userId: string): Promise<Device[]> {
  return process.env.BAIR1_REGISTRY_INDEXES_ENABLED === "true"
    ? indexedDevices("ownerId", userId)
    : scanDevices({
        expression: "ownerId = :userId",
        values: { ":userId": { S: userId } },
      });
}

export async function getDevicesForOrg(orgId: string): Promise<Device[]> {
  return process.env.BAIR1_REGISTRY_INDEXES_ENABLED === "true"
    ? indexedDevices("orgId", orgId)
    : scanDevices({
        expression: "orgId = :orgId",
        values: { ":orgId": { S: orgId } },
      });
}

async function indexedDevices(
  field: "ownerId" | "orgId",
  value: string,
): Promise<Device[]> {
  const devices: Device[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: `${field}-deviceId-index`,
        KeyConditionExpression: "#field = :value",
        ExpressionAttributeNames: { "#field": field },
        ExpressionAttributeValues: { ":value": { S: value } },
        ProjectionExpression: "deviceId",
        Limit: 200,
        ExclusiveStartKey: cursor,
      }),
    );
    for (const row of result.Items ?? []) {
      const current = row.deviceId?.S ? await getDevice(row.deviceId.S) : null;
      if (current && current[field] === value) devices.push(current);
    }
    if (devices.length > 1000)
      throw new Error("Registry listing exceeds 1000 devices");
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return devices;
}
