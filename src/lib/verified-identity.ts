import { createHash } from "node:crypto";

export interface IdentityProfile {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}
export interface VerifiedIdentity {
  profile: IdentityProfile;
  verifiedAt: number;
  validUntil: number;
}
export class IdentityProviderUnavailable extends Error {
  constructor() {
    super(
      "Sign-in verification is temporarily unavailable. Try again shortly.",
    );
  }
}
const MAXIMUM_AGE_MS = 60_000;

/** Expiry can only shorten an Auth0-verified identity's lifetime, never verify it. */
function tokenExpiry(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return Infinity;
    const { exp } = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return typeof exp === "number" && Number.isFinite(exp)
      ? exp * 1000
      : Infinity;
  } catch {
    return Infinity;
  }
}

/** Cache identities only. Roles, membership and device grants are read afresh downstream. */
export function createIdentityVerifier(options: {
  domain: string;
  read: (key: string) => Promise<VerifiedIdentity | null>;
  write: (key: string, value: VerifiedIdentity) => Promise<void>;
  now?: () => number;
  request?: typeof fetch;
}) {
  const now = options.now ?? Date.now;
  const pending = new Map<string, Promise<IdentityProfile | null>>();
  return async function verify(token: string): Promise<IdentityProfile | null> {
    if (!options.domain || !token || token.length > 8192) return null;
    const key = createHash("sha256")
      .update(options.domain)
      .update("\0")
      .update(token)
      .digest("hex");
    const existing = pending.get(key);
    if (existing) return existing;
    async function load() {
      const started = now();
      try {
        const cached = await options.read(key);
        if (
          cached &&
          typeof cached.profile?.sub === "string" &&
          cached.profile.sub &&
          Number.isFinite(cached.verifiedAt) &&
          Number.isFinite(cached.validUntil) &&
          cached.verifiedAt <= started &&
          cached.validUntil <= cached.verifiedAt + MAXIMUM_AGE_MS &&
          Math.min(cached.validUntil, tokenExpiry(token)) > started
        )
          return cached.profile;
      } catch {
        /* Storage trouble never makes an unverified token valid. */
      }
      let response: Response;
      try {
        response = await (options.request ?? fetch)(
          `https://${options.domain}/userinfo`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch {
        throw new IdentityProviderUnavailable();
      }
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new IdentityProviderUnavailable();
      let data;
      try {
        data = await response.json();
      } catch {
        throw new IdentityProviderUnavailable();
      }
      if (typeof data.sub !== "string" || !data.sub) return null;
      const profile: IdentityProfile = {
        sub: data.sub,
        emailVerified: data.email_verified === true,
        ...(typeof data.email === "string" ? { email: data.email } : {}),
        ...(typeof data.name === "string"
          ? { name: data.name }
          : typeof data.nickname === "string"
            ? { name: data.nickname }
            : {}),
        ...(typeof data.picture === "string" ? { picture: data.picture } : {}),
      };
      const validUntil = Math.min(started + MAXIMUM_AGE_MS, tokenExpiry(token));
      if (validUntil <= now()) return null;
      try {
        await options.write(key, { profile, verifiedAt: started, validUntil });
      } catch {
        /* The fresh provider verification remains authoritative. */
      }
      return profile;
    }
    const operation = load();
    // Bound pending bookkeeping even if a client submits many distinct invalid tokens.
    if (pending.size < 256) pending.set(key, operation);
    try {
      return await operation;
    } finally {
      if (pending.get(key) === operation) pending.delete(key);
    }
  };
}
