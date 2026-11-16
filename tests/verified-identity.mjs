import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLoader } from "./helpers/load-ts.mjs";
const { createIdentityVerifier, IdentityProviderUnavailable } = createLoader()(
  "src/lib/verified-identity.ts",
);
function setup() {
  let now = Date.now(),
    calls = 0;
  const rows = new Map(),
    sub = randomUUID();
  let response = () => Response.json({ sub, email_verified: true });
  const options = {
    domain: "synthetic.invalid",
    now: () => now,
    read: async (key) => rows.get(key) ?? null,
    write: async (key, row) => {
      rows.set(key, row);
    },
    request: async () => {
      calls++;
      return response();
    },
  };
  return {
    options,
    rows,
    sub,
    advance: (ms) => (now += ms),
    calls: () => calls,
    response: (fn) => (response = fn),
  };
}
test("parallel requests share verification; a second server instance reuses only the same verified token", async () => {
  const s = setup(),
    token = randomUUID(),
    verify = createIdentityVerifier(s.options);
  const results = await Promise.all(
    Array.from({ length: 12 }, () => verify(token)),
  );
  assert.equal(s.calls(), 1);
  assert.ok(results.every((row) => row.sub === s.sub));
  assert.equal((await createIdentityVerifier(s.options)(token)).sub, s.sub);
  assert.equal(s.calls(), 1);
  await verify(randomUUID());
  assert.equal(s.calls(), 2);
  assert.ok([...s.rows.keys()].every((key) => !key.includes(token)));
});
test("verification expires after sixty seconds and a rejected token cannot use stale identity", async () => {
  const s = setup(),
    verify = createIdentityVerifier(s.options),
    token = randomUUID();
  await verify(token);
  s.advance(60001);
  s.response(() => new Response("", { status: 401 }));
  assert.equal(await verify(token), null);
  assert.equal(s.calls(), 2);
  assert.equal(await createIdentityVerifier(s.options)(token), null);
  assert.equal(s.calls(), 3);
});
test("invalid and rate-limited responses are never cached as identities", async () => {
  const s = setup(),
    verify = createIdentityVerifier(s.options);
  s.response(() => new Response("", { status: 401 }));
  assert.equal(await verify(randomUUID()), null);
  assert.equal(s.rows.size, 0);
  s.response(() => new Response("", { status: 429 }));
  await assert.rejects(verify(randomUUID()), IdentityProviderUnavailable);
  assert.equal(s.rows.size, 0);
  s.response(() => Response.json({ email: "synthetic" }));
  assert.equal(await verify(randomUUID()), null);
  assert.equal(s.rows.size, 0);
});
test("cache cannot extend JWT expiry, trust a changed issuer, or survive cache failure with stale data", async () => {
  const s = setup(),
    token = [
      "synthetic",
      Buffer.from(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 2 }),
      ).toString("base64url"),
      "synthetic",
    ].join(".");
  await createIdentityVerifier(s.options)(token);
  s.advance(3000);
  s.response(() => new Response("", { status: 401 }));
  assert.equal(await createIdentityVerifier(s.options)(token), null);
  const other = { ...s.options, domain: "other.invalid" };
  s.response(() => Response.json({ sub: randomUUID() }));
  await createIdentityVerifier(other)(token);
  assert.equal(s.calls(), 3);
  const unavailable = {
    ...s.options,
    read: async () => {
      throw Error("synthetic storage failure");
    },
    write: async () => {
      throw Error("synthetic storage failure");
    },
  };
  assert.ok(await createIdentityVerifier(unavailable)(randomUUID()));
});
