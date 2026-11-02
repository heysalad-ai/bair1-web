import { createHash } from "node:crypto";
import { getUser, getUserByEmail, migrateUserId, upsertUser, type User, type Role } from "./users";

const AUTH0_DOMAIN = process.env.NEXT_PUBLIC_AUTH0_DOMAIN!;

interface Auth0TokenPayload {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

export async function verifyAuth0Token(
  token: string
): Promise<Auth0TokenPayload | null> {
  try {
    const res = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.sub !== "string" || !data.sub) return null;
    return {
      sub: data.sub,
      emailVerified: data.email_verified === true,
      email: data.email,
      name: data.name ?? data.nickname,
      picture: data.picture,
    };
  } catch {
    return null;
  }
}

export async function getOrCreateUser(
  token: string
): Promise<User | null> {
  const payload = await verifyAuth0Token(token);
  if (!payload) return null;

  const existing = await getUser(payload.sub);
  if (existing) return existing;

  // Check if a pre-seeded record exists by email (e.g. bootstrap)
  if (payload.email && payload.emailVerified) {
    const byEmail = await getUserByEmail(payload.email);
    if (byEmail && byEmail.userId !== payload.sub) {
      await migrateUserId(byEmail.userId, payload.sub, {
        email: payload.email,
        name: payload.name ?? byEmail.name,
      });
      return getUser(payload.sub);
    }
  }

  // Auto-provision new user with "user" role
  const newUser: User = {
    userId: payload.sub,
    email: payload.email ?? "",
    name: payload.name ?? "",
    role: "user",
    orgId: `personal:${createHash("sha256").update(payload.sub).digest("hex").slice(0, 24)}`,
    createdAt: new Date().toISOString(),
  };
  await upsertUser(newUser);
  return newUser;
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function requireAuth(
  request: Request
): Promise<{ user: User } | Response> {
  const token = extractToken(request);
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getOrCreateUser(token);
  if (!user) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }
  return { user };
}

export async function requireRole(
  request: Request,
  roles: Role[]
): Promise<{ user: User } | Response> {
  const result = await requireAuth(request);
  if (result instanceof Response) return result;
  if (!roles.includes(result.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}
