import { requireRole } from "@/lib/auth";
import { provisionEnrollment } from "@/lib/device-enrollment";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

export async function POST(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.deviceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(body.deviceId)
    || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) return Response.json({ error: "valid device id and name required" }, { status: 400 });
  try { return Response.json(await provisionEnrollment(body.deviceId, body.name.trim()), { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    if (error instanceof ConditionalCheckFailedException) return Response.json({ error: "device already exists" }, { status: 409 });
    throw error;
  }
}
