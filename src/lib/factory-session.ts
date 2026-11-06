import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { GetItemCommand, PutItemCommand, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";
import { storageTable } from "./storage-config";
import { getUser } from "./users";
import { getFactoryGrant, FactoryError } from "./factory-provisioning";

const table = storageTable("bair1-access");
export const FACTORY_COOKIE = "__Host-bair1-factory";
const now = () => Math.floor(Date.now() / 1000);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const key = (scope: string, entry: string) => ({ scope: { S: scope }, entry: { S: entry } });
export class FactoryLoginError extends Error {
  constructor(message: string, public status = 401, public retryAfter?: number) { super(message); }
}
export function loginName(value: unknown) {
  if (typeof value !== "string" || value.length > 120 || !/^[a-zA-Z0-9@._+-]{3,120}$/.test(value.trim())) throw new FactoryLoginError("Check the factory login and password.");
  return value.trim().toLowerCase();
}
export const credentialKey = (name: string) => key(`factory-login:${digest(loginName(name))}`, "credential");
async function get(Key: Record<string, AttributeValue>) {
  return (await dynamoClient.send(new GetItemCommand({ TableName: table, Key, ConsistentRead: true }))).Item;
}
export function passwordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived)));
}
/** Same-origin check on all native credential/session writes and cookie-auth mutations. */
export function requireFactoryOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new FactoryLoginError("Open the factory tool on this site and try again.", 403);
}
async function rateLimit(bucket: string, maximum: number) {
  const window = Math.floor(now() / 900);
  try {
    await dynamoClient.send(new UpdateItemCommand({ TableName: table, Key: key(`factory-login-rate:${digest(bucket)}:${window}`, "attempts"),
      UpdateExpression: "SET expiresAt = :ttl ADD attempts :one", ConditionExpression: "attribute_not_exists(attempts) OR attempts < :maximum",
      ExpressionAttributeValues: { ":ttl": { N: String((window + 2) * 900) }, ":one": { N: "1" }, ":maximum": { N: String(maximum) } } }));
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") throw new FactoryLoginError("Too many sign-in attempts. Wait before trying again; device uploads are unaffected.", 429, (window + 1) * 900 - now());
    throw error;
  }
}
function requestIp(request: Request) {
  // Vercel supplies this header. Never use arbitrary caller-supplied x-forwarded-for.
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unavailable";
}
export async function createFactorySession(request: Request, nameInput: unknown, password: unknown) {
  const name = loginName(nameInput);
  await rateLimit(`network:${requestIp(request)}`, 60);
  await rateLimit(`account:${name}`, 10);
  if (typeof password !== "string" || password.length > 256) throw new FactoryLoginError("Check the factory login and password.");
  const row = await get(credentialKey(name));
  // Unknown accounts perform the same expensive derivation; no identity enumeration.
  const derived = await passwordHash(password, row?.salt?.S ?? "unregistered-factory-login");
  const expected = row?.verifier?.S && /^[0-9a-f]{128}$/.test(row.verifier.S) ? Buffer.from(row.verifier.S, "hex") : Buffer.alloc(64);
  if (!timingSafeEqual(derived, expected) || !row || row.revokedAt || !row.userId?.S || !row.batchId?.S || !row.version?.S) throw new FactoryLoginError("Check the factory login and password.");
  const user = await getUser(row.userId.S);
  if (!user || user.role !== "user") throw new FactoryLoginError("Factory access is unavailable. Contact Peter.", 403);
  let grant;
  try { grant = await getFactoryGrant(user.userId); } catch (error) { if (error instanceof FactoryError) throw new FactoryLoginError("Factory batch access is unavailable or expired. Contact Peter.", 403); throw error; }
  if (grant.batchId !== row.batchId.S) throw new FactoryLoginError("Factory access is unavailable. Contact Peter.", 403);
  const token = randomBytes(32).toString("base64url"), expiresAt = Math.min(now() + 8 * 3600, grant.expiresAt);
  await dynamoClient.send(new PutItemCommand({ TableName: table, Item: { ...key(`factory-session:${digest(token)}`, "session"), userId: { S: user.userId }, login: { S: name }, credentialVersion: row.version, batchId: row.batchId, expiresAt: { N: String(expiresAt) }, createdAt: { S: new Date().toISOString() } }, ConditionExpression: "attribute_not_exists(#s)", ExpressionAttributeNames: { "#s": "scope" } }));
  return { token, expiresAt, user };
}
export function factoryCookieToken(request: Request) {
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(s => s.trim()).filter(s => s.startsWith(FACTORY_COOKIE + "="));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(FACTORY_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export async function resolveFactorySession(request: Request) {
  const token = factoryCookieToken(request);
  if (!token) return null;
  const session = await get(key(`factory-session:${digest(token)}`, "session"));
  if (!session || session.revokedAt || Number(session.expiresAt?.N) <= now() || !session.login?.S || !session.userId?.S) return null;
  const credential = await get(credentialKey(session.login.S));
  if (!credential || credential.revokedAt || credential.version?.S !== session.credentialVersion?.S || credential.userId?.S !== session.userId.S || credential.batchId?.S !== session.batchId?.S) return null;
  const user = await getUser(session.userId.S);
  if (!user || user.role !== "user") return null;
  try {
    const grant = await getFactoryGrant(user.userId);
    if (grant.batchId !== session.batchId?.S) return null;
  } catch (error) {
    if (error instanceof FactoryError) return null;
    throw error;
  }
  return { user, expiresAt: Number(session.expiresAt.N) };
}
export async function revokeFactorySession(request: Request) {
  const token = factoryCookieToken(request);
  if (token) try { await dynamoClient.send(new UpdateItemCommand({ TableName: table, Key: key(`factory-session:${digest(token)}`, "session"), UpdateExpression: "SET revokedAt = :at", ConditionExpression: "attribute_exists(userId)", ExpressionAttributeValues: { ":at": { S: new Date().toISOString() } } })); }
  catch (error) { if (!(error instanceof Error && error.name === "ConditionalCheckFailedException")) throw error; }
}
export function factorySetCookie(token: string, expiresAt: number) {
  return `${FACTORY_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${token ? Math.max(0, expiresAt - now()) : 0}`;
}
