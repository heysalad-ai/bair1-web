import { randomBytes, randomUUID, createHash } from "node:crypto";
import { GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand, TransactWriteItemsCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";
import { storageTable } from "./storage-config";

const table = storageTable("bair1-access");
export type WorkspaceRole = "owner" | "admin" | "member";
export function accessStoreEnabled() { return process.env.BAIR1_ACCESS_ENABLED === "true"; }
export class AccessStoreUnavailable extends Error {}
function requireStore() { if (!accessStoreEnabled()) throw new AccessStoreUnavailable("workspace and share storage is not enabled"); }
export function secretHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export type Workspace = { workspaceId: string; name: string; ownerId: string; role: WorkspaceRole };

export async function workspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  if (!accessStoreEnabled() || !workspaceId.startsWith("workspace:")) return null;
  const { Item } = await dynamoClient.send(new GetItemCommand({ TableName: table,
    Key: { scope: { S: workspaceId }, entry: { S: `member:${userId}` } }, ConsistentRead: true }));
  const role = Item?.role?.S;
  return Item?.revokedAt || !["owner", "admin", "member"].includes(role ?? "") ? null : role as WorkspaceRole;
}

export async function createWorkspace(userId: string, name: string): Promise<Workspace> {
  requireStore();
  const workspaceId = `workspace:${randomUUID()}`, createdAt = new Date().toISOString();
  await dynamoClient.send(new TransactWriteItemsCommand({ TransactItems: [
    { Put: { TableName: table, Item: { scope: { S: workspaceId }, entry: { S: "profile" }, name: { S: name }, ownerId: { S: userId }, createdAt: { S: createdAt } }, ConditionExpression: "attribute_not_exists(#s)", ExpressionAttributeNames: { "#s": "scope" } } },
    { Put: { TableName: table, Item: { scope: { S: workspaceId }, entry: { S: `member:${userId}` }, userId: { S: userId }, workspaceId: { S: workspaceId }, role: { S: "owner" }, createdAt: { S: createdAt } }, ConditionExpression: "attribute_not_exists(#s)", ExpressionAttributeNames: { "#s": "scope" } } },
  ] }));
  return { workspaceId, name, ownerId: userId, role: "owner" };
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  if (!accessStoreEnabled()) return [];
  const workspaces: Workspace[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamoClient.send(new QueryCommand({ TableName: table, IndexName: "userId-workspaceId-index",
      KeyConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": { S: userId } }, ExclusiveStartKey: cursor }));
    for (const row of result.Items ?? []) {
      const id = row.workspaceId?.S;
      // Re-read membership consistently: the GSI can lag a revocation.
      const role = id ? await workspaceRole(userId, id) : null;
      if (!role || !id) continue;
      const { Item } = await dynamoClient.send(new GetItemCommand({ TableName: table, Key: { scope: { S: id }, entry: { S: "profile" } } }));
      if (Item) workspaces.push({ workspaceId: id, name: Item.name?.S ?? "Workspace", ownerId: Item.ownerId?.S ?? "", role });
    }
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return workspaces;
}

export async function setWorkspaceMember(workspaceId: string, userId: string, role: "admin" | "member" | null) {
  requireStore();
  // The HTTP layer verifies the workspace owner. An owner cannot be replaced here.
  if (role === null) {
    await dynamoClient.send(new UpdateItemCommand({ TableName: table, Key: { scope: { S: workspaceId }, entry: { S: `member:${userId}` } },
      UpdateExpression: "SET revokedAt = :now", ConditionExpression: "attribute_exists(userId) AND #r <> :owner",
      ExpressionAttributeNames: { "#r": "role" }, ExpressionAttributeValues: { ":now": { S: new Date().toISOString() }, ":owner": { S: "owner" } } }));
  } else {
    await dynamoClient.send(new PutItemCommand({ TableName: table, Item: { scope: { S: workspaceId }, entry: { S: `member:${userId}` }, userId: { S: userId }, workspaceId: { S: workspaceId }, role: { S: role }, createdAt: { S: new Date().toISOString() } },
      ConditionExpression: "attribute_not_exists(#r) OR #r <> :owner", ExpressionAttributeNames: { "#r": "role" }, ExpressionAttributeValues: { ":owner": { S: "owner" } } }));
  }
}

export type StoredShare = { id: string; token: string; expiresAt: number };
export async function createStoredShare(deviceId: string, ownerId: string, ownershipVersion: string, hours = 24): Promise<StoredShare> {
  requireStore();
  const id = randomUUID(), token = randomBytes(32).toString("base64url"), expiresAt = Math.floor(Date.now() / 1000) + Math.min(Math.max(hours, 1), 168) * 3600;
  await dynamoClient.send(new PutItemCommand({ TableName: table, Item: {
    scope: { S: `device:${deviceId}` }, entry: { S: `share:${id}` }, tokenHash: { S: secretHash(token) },
    ownerId: { S: ownerId }, ownershipVersion: { S: ownershipVersion }, expiresAt: { N: String(expiresAt) }, createdAt: { S: new Date().toISOString() },
  }, ConditionExpression: "attribute_not_exists(#s)", ExpressionAttributeNames: { "#s": "scope" } }));
  return { id, token: `${id}.${token}`, expiresAt };
}

export async function storedShareValid(deviceId: string, supplied: string | null | undefined, ownerId: string, version: string): Promise<boolean> {
  if (!accessStoreEnabled() || !supplied || supplied.length > 160) return false;
  const [id, token, extra] = supplied.split(".");
  if (!id || !token || extra) return false;
  const { Item } = await dynamoClient.send(new GetItemCommand({ TableName: table, Key: { scope: { S: `device:${deviceId}` }, entry: { S: `share:${id}` } }, ConsistentRead: true }));
  return Boolean(Item && !Item.revokedAt && Number(Item.expiresAt?.N) > Date.now() / 1000
    && Item.ownerId?.S === ownerId && Item.ownershipVersion?.S === version && Item.tokenHash?.S === secretHash(token));
}

export async function listStoredShares(deviceId: string, ownerId: string) {
  if (!accessStoreEnabled()) return [];
  const { Items } = await dynamoClient.send(new QueryCommand({ TableName: table, KeyConditionExpression: "#s = :s AND begins_with(entry, :p)",
    ExpressionAttributeNames: { "#s": "scope" }, ExpressionAttributeValues: { ":s": { S: `device:${deviceId}` }, ":p": { S: "share:" } }, ConsistentRead: true, Limit: 100 }));
  return (Items ?? []).filter(row => row.ownerId?.S === ownerId).map(row => ({ id: row.entry.S!.slice(6), expiresAt: Number(row.expiresAt?.N), revokedAt: row.revokedAt?.S ?? null, createdAt: row.createdAt?.S ?? null }));
}

export async function revokeStoredShare(deviceId: string, ownerId: string, id: string) {
  requireStore();
  await dynamoClient.send(new UpdateItemCommand({ TableName: table, Key: { scope: { S: `device:${deviceId}` }, entry: { S: `share:${id}` } },
    UpdateExpression: "SET revokedAt = :now", ConditionExpression: "ownerId = :owner",
    ExpressionAttributeValues: { ":owner": { S: ownerId }, ":now": { S: new Date().toISOString() } } }));
}

export async function createWorkspaceInvite(workspaceId: string) {
  requireStore();
  const token = randomBytes(32).toString("base64url"), expiresAt = Math.floor(Date.now() / 1000) + 86400;
  await dynamoClient.send(new PutItemCommand({ TableName: table, Item: { scope: { S: workspaceId }, entry: { S: `invite:${secretHash(token)}` }, expiresAt: { N: String(expiresAt) } } }));
  return { token, expiresAt };
}
export async function acceptWorkspaceInvite(workspaceId: string, token: string, userId: string) {
  requireStore();
  await dynamoClient.send(new TransactWriteItemsCommand({ TransactItems: [
    { Update: { TableName: table, Key: { scope: { S: workspaceId }, entry: { S: `invite:${secretHash(token)}` } },
      UpdateExpression: "SET usedAt = :now", ConditionExpression: "expiresAt > :now AND attribute_not_exists(usedAt)", ExpressionAttributeValues: { ":now": { N: String(Math.floor(Date.now() / 1000)) } } } },
    { Put: { TableName: table, Item: { scope: { S: workspaceId }, entry: { S: `member:${userId}` }, userId: { S: userId }, workspaceId: { S: workspaceId }, role: { S: "member" }, createdAt: { S: new Date().toISOString() } },
      ConditionExpression: "attribute_not_exists(#r) OR attribute_exists(revokedAt)", ExpressionAttributeNames: { "#r": "role" } } },
  ] }));
}
export async function workspaceMembers(workspaceId: string) {
  requireStore();
  const { Items } = await dynamoClient.send(new QueryCommand({ TableName: table, KeyConditionExpression: "#s = :s AND begins_with(entry, :m)",
    ExpressionAttributeNames: { "#s": "scope" }, ExpressionAttributeValues: { ":s": { S: workspaceId }, ":m": { S: "member:" } }, ConsistentRead: true, Limit: 100 }));
  return (Items ?? []).filter(item => !item.revokedAt).map(item => ({ userId: item.userId?.S, role: item.role?.S }));
}
