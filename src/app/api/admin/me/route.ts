import { requireAuth } from "@/lib/auth";
import { accessibleDevices } from "@/lib/device-access";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const { user } = auth;
  const devices = await accessibleDevices({ kind: "user", user });

  return Response.json({ user, devices });
}
