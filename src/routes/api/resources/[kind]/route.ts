import { body, context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";
import { validBlock, validBrand } from "@postly/email-core/workspace";

type Params = { params: Promise<{ kind: string }> };
export async function GET(_request: Request, { params }: Params) {
  return endpoint(async () => {
    const { kind } = await params;
    if (!["brand", "blocks"].includes(kind)) throw new HttpError(404, "Resource not found.");
    const { client, workspaceId } = await context();
    const { data, error } = await client.from("workspace_resources").select("content,revision").eq("workspace_id", workspaceId).eq("kind", kind).maybeSingle();
    databaseError(error);
    return Response.json(data || { content: null, revision: 0 });
  });
}
export async function PUT(request: Request, { params }: Params) {
  return endpoint(async () => {
    sameOrigin(request);
    const { kind } = await params;
    const input = await body(request);
    const valid = kind === "brand" ? validBrand(input.content) : kind === "blocks" && Array.isArray(input.content) && input.content.length <= 100 && input.content.every(validBlock);
    if (!valid || !Number.isInteger(input.revision) || Number(input.revision) < 0) throw new HttpError(422, "Invalid workspace resource.");
    const { client, workspaceId } = await context(true);
    const { data: revision, error } = await client.rpc("save_resource", { w: workspaceId, resource_kind: kind, payload: input.content, expected_revision: input.revision });
    databaseError(error);
    return Response.json({ revision });
  });
}
