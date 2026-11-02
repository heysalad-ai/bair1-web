import { requireRole } from "@/lib/auth";
import { getAllUsers, upsertUser, updateUserRole, deleteUser, type Role } from "@/lib/users";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const users = await getAllUsers();
  return Response.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const { userId, email, name, role, orgId } = body;

  if (!userId || !email) {
    return Response.json({ error: "userId and email required" }, { status: 400 });
  }

  // Only super_admin can create admins
  if (role === "super_admin" && auth.user.role !== "super_admin") {
    return Response.json({ error: "Only super_admin can assign super_admin role" }, { status: 403 });
  }
  if (role === "admin" && auth.user.role !== "super_admin") {
    return Response.json({ error: "Only super_admin can assign admin role" }, { status: 403 });
  }

  await upsertUser({
    userId,
    email,
    name: name ?? "",
    role: role ?? "user",
    orgId: orgId ?? auth.user.orgId,
    createdAt: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const { userId, role } = body;

  if (!userId || !role) {
    return Response.json({ error: "userId and role required" }, { status: 400 });
  }

  if (role === "super_admin" && auth.user.role !== "super_admin") {
    return Response.json({ error: "Only super_admin can assign super_admin role" }, { status: 403 });
  }

  await updateUserRole(userId, role as Role);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  await deleteUser(userId);
  return Response.json({ ok: true });
}
