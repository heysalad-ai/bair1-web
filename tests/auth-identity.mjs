import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { createLoader } from "./helpers/load-ts.mjs";
test("Concurrent first-login creation cannot overwrite an existing role record", async (t) => {
  const oldFetch = global.fetch,
    oldDomain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  process.env.NEXT_PUBLIC_AUTH0_DOMAIN = "synthetic.invalid";
  t.after(() => {
    global.fetch = oldFetch;
    if (oldDomain === undefined) delete process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
    else process.env.NEXT_PUBLIC_AUTH0_DOMAIN = oldDomain;
  });
  const sub = randomUUID(),
    existing = {
      userId: sub,
      role: "admin",
      orgId: "personal:" + randomUUID(),
    };
  let reads = 0;
  global.fetch = async () => Response.json({ sub, email_verified: true });
  const auth = createLoader({
    "./identity-cache": {
      readIdentity: async () => null,
      writeIdentity: async () => {},
    },
    "./users": {
      getUser: async () => (++reads === 1 ? null : existing),
      upsertUser: async (_user, onlyIfAbsent) => {
        assert.equal(onlyIfAbsent, true);
        throw new ConditionalCheckFailedException({
          $metadata: {},
          message: "Synthetic race",
        });
      },
    },
  })("src/lib/auth.ts");
  assert.equal(await auth.getOrCreateUser(randomUUID()), existing);
  assert.equal(reads, 2);
});
test("Bootstrap fails closed unless both a secret and an approved subject are configured", async () => {
  const previous = {
    secret: process.env.ADMIN_BOOTSTRAP_SECRET,
    sub: process.env.ADMIN_BOOTSTRAP_SUB,
  };
  try {
    delete process.env.ADMIN_BOOTSTRAP_SECRET;
    delete process.env.ADMIN_BOOTSTRAP_SUB;
    const route = createLoader({
      "@/lib/auth": {
        verifyAuth0Token: async () => {
          throw new Error("Unexpected token verification");
        },
      },
      "@/lib/users": {},
    })("src/app/api/admin/bootstrap/route.ts");
    assert.equal(
      (
        await route.POST(
          new Request("https://synthetic.invalid", { method: "POST" }),
        )
      ).status,
      503,
    );
    process.env.ADMIN_BOOTSTRAP_SECRET = randomUUID();
    assert.equal(
      (
        await route.POST(
          new Request("https://synthetic.invalid", { method: "POST" }),
        )
      ).status,
      503,
    );
  } finally {
    for (const [key, value] of [
      ["ADMIN_BOOTSTRAP_SECRET", previous.secret],
      ["ADMIN_BOOTSTRAP_SUB", previous.sub],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
test("verified identity reuse does not cache roles, and provider throttling is a service error", async (t) => {
  const oldFetch = global.fetch,
    oldDomain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  process.env.NEXT_PUBLIC_AUTH0_DOMAIN = "synthetic.invalid";
  t.after(() => {
    global.fetch = oldFetch;
    if (oldDomain === undefined) delete process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
    else process.env.NEXT_PUBLIC_AUTH0_DOMAIN = oldDomain;
  });
  const rows = new Map(),
    sub = randomUUID(),
    token = randomUUID();
  let role = "super_admin",
    calls = 0;
  global.fetch = async () => {
    calls++;
    return Response.json({ sub });
  };
  const auth = createLoader({
    "./identity-cache": {
      readIdentity: async (key) => rows.get(key) ?? null,
      writeIdentity: async (key, row) => rows.set(key, row),
    },
    "./users": {
      getUser: async () => ({ userId: sub, role }),
      upsertUser: async () => {
        throw Error("Unexpected provisioning");
      },
    },
  })("src/lib/auth.ts");
  assert.equal((await auth.getOrCreateUser(token)).role, "super_admin");
  role = "user";
  assert.equal((await auth.getOrCreateUser(token)).role, "user");
  assert.equal(calls, 1);
  global.fetch = async () => new Response("", { status: 429 });
  const result = await auth.requireAuth(
    new Request("https://synthetic.invalid", {
      headers: { Authorization: `Bearer ${randomUUID()}` },
    }),
  );
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("Retry-After"), "60");
});
