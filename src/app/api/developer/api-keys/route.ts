import { getDevice } from "@/lib/devices";
import { requireAuth } from "@/lib/auth";
import {
  createApiKey,
  listApiKeysForUser,
  revokeApiKey,
  type ApiKeyScope,
} from "@/lib/api-keys";

const ALLOWED_SCOPES: ApiKeyScope[] = [
  "read:devices",
  "write:devices",
  "read:readings",
  "write:readings",
  "export:readings",
];

function normalizeScopes(input: unknown): ApiKeyScope[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.filter((scope): scope is ApiKeyScope =>
    ALLOWED_SCOPES.includes(scope as ApiKeyScope)
  );
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const keys = await listApiKeysForUser(auth.user.userId);
  return Response.json({ keys });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "JSON object required" }, { status: 400 });
  const name = String(body.name ?? "").trim();
  if (!name) {
    return Response.json({ error: "name required" }, { status: 400 });
  }

  const scopes = normalizeScopes(body.scopes);
  if (scopes && !scopes.length) return Response.json({ error: "select at least one scope" }, { status: 400 });
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : undefined;
  if (deviceId) {
    const device = await getDevice(deviceId);
    if (!device || device.ownerId !== auth.user.userId) return Response.json({ error: "device not found" }, { status: 404 });
  }
  const result = await createApiKey({
    name,
    userId: auth.user.userId,
    orgId: auth.user.orgId,
    scopes, deviceId,
  });

  return Response.json({
    key: result.key,
    record: result.record,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  await revokeApiKey({ id, userId: auth.user.userId });
  return Response.json({ ok: true });
}
