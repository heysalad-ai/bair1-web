import { requireAuth } from "@/lib/auth";
import { accessStoreEnabled, listWorkspaces, createWorkspace, workspaceRole, setWorkspaceMember, createWorkspaceInvite, acceptWorkspaceInvite, workspaceMembers } from "@/lib/access-store";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("workspaceId");
  if (id) {
    if (await workspaceRole(auth.user.userId, id) !== "owner") return Response.json({ error: "workspace not found" }, { status: 404 });
    return Response.json({ members: await workspaceMembers(id) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json({ enabled: accessStoreEnabled(), workspaces: await listWorkspaces(auth.user.userId) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!accessStoreEnabled()) return Response.json({ error: "workspaces are not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "accept") {
    if (typeof body.workspaceId !== "string" || !body.workspaceId.startsWith("workspace:") || typeof body.token !== "string" || body.token.length > 100) return Response.json({ error: "valid invitation required" }, { status: 400 });
    try { await acceptWorkspaceInvite(body.workspaceId, body.token, auth.user.userId); }
    catch { return Response.json({ error: "invitation is invalid, expired, already used, or you are already a member" }, { status: 409 }); }
    return Response.json({ ok: true });
  }
  if (body.action === "invite") {
    if (typeof body.workspaceId !== "string" || await workspaceRole(auth.user.userId, body.workspaceId) !== "owner") return Response.json({ error: "workspace not found" }, { status: 404 });
    return Response.json(await createWorkspaceInvite(body.workspaceId), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) return Response.json({ error: "workspace name required (80 characters maximum)" }, { status: 400 });
  return Response.json({ workspace: await createWorkspace(auth.user.userId, body.name.trim()) }, { status: 201 });
}
export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.workspaceId !== "string" || typeof body.userId !== "string" || !["admin", "member", null].includes(body.role)) return Response.json({ error: "workspace, member and role required" }, { status: 400 });
  if (await workspaceRole(auth.user.userId, body.workspaceId) !== "owner") return Response.json({ error: "workspace not found" }, { status: 404 });
  const current = await workspaceRole(body.userId, body.workspaceId);
  if (!current || current === "owner") return Response.json({ error: "member not found or ownership change unsupported" }, { status: 409 });
  await setWorkspaceMember(body.workspaceId, body.userId, body.role);
  return Response.json({ ok: true });
}
