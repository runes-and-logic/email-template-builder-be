import { context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";
import { serviceClient } from "../../../../lib/supabase/service.js";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, workspaceId } = await context(true);
    const { id } = await params;
    const { data, error } = await client.from("assets").select("object_key").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    databaseError(error);
    if (!data) throw new HttpError(404, "Asset not found.");
    const admin = serviceClient();
    const { error: storageError } = await admin.storage.from("email-assets").remove([data.object_key]);
    if (storageError) throw new HttpError(503, "Unable to remove asset. Please retry.");
    const result = await admin.from("assets").delete().eq("workspace_id", workspaceId).eq("id", id);
    databaseError(result.error);
    return Response.json({ ok: true });
  });
}
