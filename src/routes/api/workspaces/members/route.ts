import { body, context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, workspaceId, role } = await context();
    if (role !== "owner") throw new HttpError(403, "Only workspace owners can manage membership.");
    const input = await body(request, 1000);
    if (typeof input.email !== "string" || input.email.length > 254 || !["editor","viewer","remove"].includes(String(input.role))) throw new HttpError(422, "Invalid member details.");
    const { error } = await client.rpc("manage_member", { w: workspaceId, member_email: input.email, member_role: input.role });
    if (error?.message.includes("member_unavailable")) throw new HttpError(422, "Use an existing, verified account other than the workspace owner.");
    databaseError(error);
    return Response.json({ ok: true });
  });
}
