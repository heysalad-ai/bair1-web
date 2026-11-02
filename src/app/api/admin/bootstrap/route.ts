import { getAllUsers, getUser, upsertUser } from "@/lib/users";
import { verifyAuth0Token } from "@/lib/auth";

// Bootstrap the first super_admin. Only works if no super_admin exists yet.
export async function POST(request: Request) {
  const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  const approvedSubject = process.env.ADMIN_BOOTSTRAP_SUB;
  if (!bootstrapSecret || !approvedSubject)
    return Response.json(
      { error: "Bootstrap is not configured" },
      { status: 503 },
    );
  if (bootstrapSecret) {
    const provided = request.headers.get("x-bootstrap-secret");
    if (provided !== bootstrapSecret) {
      return Response.json(
        { error: "Invalid bootstrap secret" },
        { status: 403 },
      );
    }
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return Response.json({ error: "Bearer token required" }, { status: 401 });
  }

  const token = auth.slice(7);
  const payload = await verifyAuth0Token(token);
  if (!payload || payload.sub !== approvedSubject) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const users = await getAllUsers();
  const superAdmin = users.find((user) => user.role === "super_admin");
  if (superAdmin && superAdmin.userId !== payload.sub) {
    return Response.json(
      { error: "super_admin already exists" },
      { status: 403 },
    );
  }

  const existing = await getUser(payload.sub);
  if (existing?.role === "super_admin") {
    return Response.json({
      ok: true,
      message: "Already a super_admin",
      user: existing,
    });
  }

  await upsertUser({
    userId: payload.sub,
    email: payload.email ?? "",
    name: payload.name ?? "",
    role: "super_admin",
    orgId: "default",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });

  const user = await getUser(payload.sub);
  return Response.json({
    ok: true,
    message: "Bootstrapped as super_admin",
    user,
  });
}
