import { storageTable } from "./storage-config";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const TABLE = storageTable("bair1-users");

export type Role = "super_admin" | "admin" | "user";

export interface User {
  userId: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  createdAt: string;
}

function parseUser(item: Record<string, any>): User {
  return {
    userId: item.userId?.S ?? "",
    email: item.email?.S ?? "",
    name: item.name?.S ?? "",
    role: (item.role?.S as Role) ?? "user",
    orgId: item.orgId?.S ?? "default",
    createdAt: item.createdAt?.S ?? "",
  };
}

export async function getUser(userId: string): Promise<User | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { userId: { S: userId } },
    })
  );
  return result.Item ? parseUser(result.Item) : null;
}

export async function upsertUser(user: User): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        userId: { S: user.userId },
        email: { S: user.email },
        name: { S: user.name },
        role: { S: user.role },
        orgId: { S: user.orgId },
        createdAt: { S: user.createdAt },
      },
    })
  );
}

export async function updateUserRole(
  userId: string,
  role: Role
): Promise<void> {
  await client.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { userId: { S: userId } },
      UpdateExpression: "SET #r = :role",
      ExpressionAttributeNames: { "#r": "role" },
      ExpressionAttributeValues: { ":role": { S: role } },
    })
  );
}

export async function getAllUsers(): Promise<User[]> {
  const result = await client.send(
    new ScanCommand({ TableName: TABLE })
  );
  return (result.Items ?? []).map(parseUser);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await client.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": { S: email } },
      Limit: 1,
    })
  );
  const item = result.Items?.[0];
  return item ? parseUser(item) : null;
}

export async function migrateUserId(
  oldUserId: string,
  newUserId: string,
  updates: Partial<Pick<User, "email" | "name">>
): Promise<void> {
  const existing = await getUser(oldUserId);
  if (!existing) return;
  // Delete old record and create new one with the Auth0 sub
  await deleteUser(oldUserId);
  await upsertUser({
    ...existing,
    userId: newUserId,
    email: updates.email ?? existing.email,
    name: updates.name ?? existing.name,
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await client.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: { userId: { S: userId } },
    })
  );
}

export function canManageUsers(role: Role): boolean {
  return role === "super_admin" || role === "admin";
}

export function canManageDevices(role: Role): boolean {
  return role === "super_admin" || role === "admin";
}

export function isSuperAdmin(role: Role): boolean {
  return role === "super_admin";
}
