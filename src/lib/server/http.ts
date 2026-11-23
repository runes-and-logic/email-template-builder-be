import { cookies } from "../cookies.js";
import { cloudMode } from "../config.js";
import { serverClient } from "../supabase/server.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  if (!expected || origin !== new URL(expected).origin) throw new HttpError(403, "Request origin is not allowed.");
}

export async function readBytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  return bytes;
}

export async function body(request: Request, max = 4_000_000): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Expected JSON.");
  const bytes = await readBytes(request, max);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new HttpError(400, "Invalid JSON object."); }
}

export async function identity() {
  if (!cloudMode) throw new HttpError(503, "Cloud services are disabled in demo mode.");
  const client = await serverClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new HttpError(401, "Please sign in.");
  return { client, user };
}

export async function context(write = false) {
  const { client, user } = await identity();
  const selected = (await cookies()).get("postly-workspace")?.value;
  let workspaceId: string | undefined;
  if (selected && /^[a-f0-9-]{36}$/i.test(selected)) {
    const { data, error } = await client.from("workspace_members").select("workspace_id").eq("workspace_id", selected).eq("user_id", user.id).maybeSingle();
    databaseError(error);
    if (data) workspaceId = data.workspace_id;
  }
  if (!workspaceId) {
    const { data, error } = await client.rpc("ensure_workspace");
    if (error || !data) throw new HttpError(503, "Workspace is unavailable.");
    workspaceId = data as string;
  }
  const { data: member, error } = await client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).single();
  if (error || !member || (write && !["owner", "editor"].includes(member.role))) throw new HttpError(403, "You do not have permission for this operation.");
  return { client, user, workspaceId: workspaceId as string, role: member.role as string };
}

export function databaseError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.message.includes("revision_conflict")) throw new HttpError(409, "This email changed in another tab. Reload before saving; your recovery copy is retained.");
  if (error.message.includes("quota_exceeded")) throw new HttpError(402, "Your plan limit has been reached.");
  if (error.message.includes("not_found")) throw new HttpError(404, "Email not found.");
  if (error.code === "23514" || error.code === "22001") throw new HttpError(422, "Content exceeds supported limits or contains invalid values.");
  if (error.code === "23505") throw new HttpError(409, "A record with these details already exists.");
  if (error.code === "42501") throw new HttpError(403, "Permission denied.");
  console.error("database_operation_failed", { code: error.code });
  throw new HttpError(503, "The service is unavailable. Please try again.");
}

export async function endpoint(run: () => Promise<Response>) {
  try {
    const original = await run();
    const response = new Response(original.body, { status: original.status, statusText: original.statusText, headers: original.headers });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const known = error instanceof HttpError;
    if (!known) console.error("request_failed", { name: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: known ? error.message : "The service is unavailable. Please try again." }, { status: known ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
