import { requireAuth } from "@/lib/auth";
import { FACTORY_COOKIE, requireFactoryOrigin, resolveFactorySession, FactoryLoginError } from "./factory-session";
/** Cookie authority exists only on factory routes; regular dashboard/admin auth is unchanged. */
export async function requireFactoryAuth(request: Request) {
  if (!(request.headers.get("cookie") ?? "").split(";").some(c => c.trim().startsWith(FACTORY_COOKIE + "="))) return requireAuth(request);
  try {
    if (!["GET", "HEAD"].includes(request.method)) requireFactoryOrigin(request);
    const session = await resolveFactorySession(request);
    return session ? { user: session.user } : Response.json({ error: "Factory session ended. Sign in to the factory tool again." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof FactoryLoginError ? error.message : "Factory sign-in is temporarily unavailable. Retry shortly." }, { status: error instanceof FactoryLoginError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
