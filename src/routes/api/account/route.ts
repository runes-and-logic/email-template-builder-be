import { context, databaseError, endpoint } from "../../../lib/server/http.js";
export async function GET() {
  return endpoint(async () => {
    const { client, user, workspaceId, role } = await context();
    const [workspace, subscription, effective, assets, documents] = await Promise.all([
      client.from("workspaces").select("name").eq("id", workspaceId).single(),
      client.from("subscriptions").select("plan_id,status,current_end").eq("workspace_id", workspaceId).maybeSingle(),
      client.rpc("effective_plan", { w: workspaceId }),
      client.from("assets").select("size").eq("workspace_id", workspaceId),
      client.from("documents").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("deleted_at", null),
    ]);
    [workspace, subscription, effective, assets, documents].forEach(result => databaseError(result.error));
    const { data: plan, error } = await client.from("plans").select("id,name,document_limit,asset_limit").eq("id", effective.data).single();
    databaseError(error);
    return Response.json({ email: user.email, workspaceId, workspace: workspace.data?.name, role, plan, subscription: subscription.data, usage: { documents: documents.count, assets: assets.data?.reduce((sum, item) => sum + item.size, 0) } });
  });
}
