import { context, databaseError, endpoint } from "../../../../../lib/server/http.js";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { client, workspaceId } = await context();
    const { id } = await params;
    const { data, error } = await client.from("document_versions").select("revision,content,created_at").eq("workspace_id", workspaceId).eq("document_id", id).order("revision", { ascending: false }).limit(20);
    databaseError(error);
    return Response.json({ versions: data });
  });
}
