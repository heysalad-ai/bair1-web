import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { createHash } from "node:crypto";
import { getUser, upsertUser, type User, type Role } from "./users";

import {
  createIdentityVerifier,
  IdentityProviderUnavailable,
} from "./verified-identity";
import { readIdentity, writeIdentity } from "./identity-cache";

export const verifyAuth0Token = createIdentityVerifier({
  domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "",
  read: readIdentity,
  write: writeIdentity,
});

export async function getOrCreateUser(token: string): Promise<User | null> {
  const payload = await verifyAuth0Token(token);
  if (!payload) return null;

  const existing = await getUser(payload.sub);
  if (existing) return existing;

  // Identity is the verified issuer subject. Email alone never transfers roles or history.

  // Auto-provision new user with "user" role
  const newUser: User = {
    userId: payload.sub,
    email: payload.email ?? "",
    name: payload.name ?? "",
    role: "user",
    orgId: `personal:${createHash("sha256").update(payload.sub).digest("hex").slice(0, 24)}`,
    createdAt: new Date().toISOString(),
  };
  try {
    await upsertUser(newUser, true);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException)
      return getUser(payload.sub);
    throw error;
  }
  return newUser;
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function requireAuth(
  request: Request,
): Promise<{ user: User } | Response> {
  const token = extractToken(request);
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user: User | null;
  try {
    user = await getOrCreateUser(token);
  } catch (error) {
    if (error instanceof IdentityProviderUnavailable)
      return Response.json(
        { error: error.message },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    throw error;
  }
  if (!user) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }
  return { user };
}

export async function requireRole(
  request: Request,
  roles: Role[],
): Promise<{ user: User } | Response> {
  const result = await requireAuth(request);
  if (result instanceof Response) return result;
  if (!roles.includes(result.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
