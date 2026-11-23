import { body, context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";

type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  return endpoint(async () => {
    const { client, workspaceId } = await context();
    const { id } = await params;
    const { data, error } = await client.from("documents").select("content,revision").eq("workspace_id", workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
    databaseError(error);
    if (!data) throw new HttpError(404, "Email not found. It may have been deleted or belong to another workspace.");
    return Response.json({ document: data.content, revision: data.revision });
  });
}
export async function PATCH(request: Request, { params }: Params) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, workspaceId } = await context(true);
    const { id } = await params;
    const input = await body(request, 1000);
    if (!Number.isInteger(input.revision) || typeof input.deleted !== "boolean") throw new HttpError(422, "Invalid deletion request.");
    const { data: revision, error } = await client.rpc("set_document_deleted", { w: workspaceId, document_id: id, expected_revision: input.revision, deleted: input.deleted });
    databaseError(error);
    return Response.json({ revision });
  });
}
