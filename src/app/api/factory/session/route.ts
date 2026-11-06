import { readJsonObject } from "@/lib/request-limits";
import { createFactorySession, resolveFactorySession, revokeFactorySession, requireFactoryOrigin, factorySetCookie, FactoryLoginError } from "@/lib/factory-session";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const status = error instanceof FactoryLoginError ? error.status : error instanceof RangeError ? 400 : 503;
  return Response.json({ error: status === 503 ? "Factory sign-in is temporarily unavailable. Retry shortly." : error instanceof Error ? error.message : "Sign-in unavailable" }, { status, headers: { ...headers, ...(error instanceof FactoryLoginError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
}
export async function GET(request: Request) {
  try { const session = await resolveFactorySession(request); return Response.json({ authenticated: Boolean(session), ...(session ? { user: { email: session.user.email }, expiresAt: session.expiresAt } : {}) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireFactoryOrigin(request);
    const body = await readJsonObject(request, 2048);
    const session = await createFactorySession(request, body.login, body.password);
    // An explicit login replaces/revokes this browser's previous native session.
    await revokeFactorySession(request);
    return Response.json({ authenticated: true, user: { email: session.user.email }, expiresAt: session.expiresAt }, { headers: { ...headers, "Set-Cookie": factorySetCookie(session.token, session.expiresAt) } });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { requireFactoryOrigin(request); await revokeFactorySession(request); return Response.json({ ok: true }, { headers: { ...headers, "Set-Cookie": factorySetCookie("", 0) } }); }
  catch (error) { return failure(error); }
}
