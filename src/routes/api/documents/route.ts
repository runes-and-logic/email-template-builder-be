import { body, context, databaseError, endpoint, HttpError, sameOrigin } from "../../../lib/server/http.js";
import { validDocument } from "@postly/email-core/workspace";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { client, workspaceId } = await context();
    const url = new URL(request.url);
    const page = Math.max(0, Math.min(10000, Number(url.searchParams.get("page")) || 0));
    const trash = url.searchParams.get("trash") === "true";
    let query = client.from("documents").select("content,revision,deleted_at", { count: "exact" }).eq("workspace_id", workspaceId);
    query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
    const search = (url.searchParams.get("search") || "").slice(0, 200).replace(/[%_\\]/g, "\\$&");
    if (search) query = query.ilike("name", `%${search}%`);
    const status = url.searchParams.get("status");
    if (status === "Draft" || status === "Saved") query = query.eq("content->>status", status);
    const category = url.searchParams.get("category");
    if (category) query = query.eq("category", category.slice(0, 100));
    const { data, error, count } = await query.order("updated_at", { ascending: false }).range(page * 12, page * 12 + 11);
    databaseError(error);
    return Response.json({ documents: data?.map(row => ({ ...row.content, revision: row.revision })), count, page });
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, workspaceId } = await context(true);
    const input = await body(request);
    if (!validDocument(input.document) || !Number.isInteger(input.revision) || Number(input.revision) < 0) throw new HttpError(422, "Invalid email document.");
    const document = { ...input.document, modified: new Date().toISOString() };
    const { data: revision, error } = await client.rpc("save_document", { w: workspaceId, payload: document, expected_revision: input.revision });
    databaseError(error);
    return Response.json({ document, revision });
  });
}
