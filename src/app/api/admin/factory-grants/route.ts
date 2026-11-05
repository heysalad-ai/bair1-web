import { requireRole } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-limits";
import { createFactoryGrant, FactoryError } from "@/lib/factory-provisioning";
export async function POST(request: Request) {
  const auth = await requireRole(request, ["super_admin"]); if (auth instanceof Response) return auth;
  try {
    const body = await readJsonObject(request, 2048);
    if (typeof body.userId !== "string") return Response.json({ error: "User required" }, { status: 400 });
    return Response.json(await createFactoryGrant(body.userId, Number(body.maximum ?? 25)), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof FactoryError ? error.message : "Grant not created; an active grant may already exist." }, { status: error instanceof FactoryError ? error.status : 409 });
  }
}
