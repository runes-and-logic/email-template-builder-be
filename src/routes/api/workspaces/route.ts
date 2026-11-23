import { cookies } from "../../../lib/cookies.js";
import { body, context, databaseError, endpoint, HttpError, identity, sameOrigin } from "../../../lib/server/http.js";
export async function GET() {
  return endpoint(async () => {
    const { client, user } = await context();
    const memberships = await client.from("workspace_members").select("workspace_id").eq("user_id", user.id);
    databaseError(memberships.error);
    const { data, error } = await client.from("workspaces").select("id,name").in("id", memberships.data?.map(item => item.workspace_id) || []).order("created_at");
    databaseError(error);
    return Response.json({ workspaces: data });
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, user } = await identity();
    const input = await body(request, 1000);
    const { data, error } = await client.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("workspace_id", input.workspaceId).maybeSingle();
    if (error || !data) throw new HttpError(403, "Workspace access denied.");
    (await cookies()).set("postly-workspace", data.workspace_id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 2592000 });
    return Response.json({ ok: true });
  });
}
