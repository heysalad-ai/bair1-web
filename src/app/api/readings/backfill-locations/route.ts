import { requireRole } from "@/lib/auth";
/** Legacy bulk mutation is retired. A reviewed, bounded migration must replace it. */
export async function POST(request: Request) {
  const auth = await requireRole(request, ["super_admin"]);
  if (auth instanceof Response) return auth;
  return Response.json({ error: "Bulk location backfill is retired; use the reviewed staging migration procedure" }, { status: 410 });
}
