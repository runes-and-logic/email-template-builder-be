import { body, databaseError, endpoint, HttpError, identity, sameOrigin } from "../../../lib/server/http.js";
import { validDocument } from "@postly/email-core/workspace";
const access: Record<string, string[]> = { super_admin: ["users","workspaces","templates","plans","subscriptions","audit","roles"], operations: ["users","workspaces","audit"], support: ["users","workspaces"], billing: ["plans","subscriptions"], content: ["templates"] };
async function admin() {
  const { client, user } = await identity();
  const { data } = await client.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!data || !access[data.role]) throw new HttpError(403, "Platform administrator access is required.");
  return { client, role: data.role, sections: access[data.role] };
}
export async function GET(request: Request) {
  return endpoint(async () => {
    const { client, role, sections } = await admin();
    const url = new URL(request.url);
    const section = url.searchParams.get("section") || sections[0];
    if (!sections.includes(section)) throw new HttpError(403, "This section is not available to your role.");
    const { data, error } = await client.rpc("platform_records", { section, page_number: Math.max(0, Number(url.searchParams.get("page")) || 0), query_text: (url.searchParams.get("search") || "").slice(0, 200) });
    databaseError(error);
    return Response.json({ ...data, role, sections, section });
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, sections } = await admin();
    const input = await body(request);
    if (typeof input.section !== "string" || !sections.includes(input.section)) throw new HttpError(403, "This operation is not available to your role.");
    if (input.section === "templates") {
      if (!validDocument(input.document) || typeof input.templateId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.templateId) || typeof input.published !== "boolean") throw new HttpError(422, "Choose a valid email and catalog ID.");
      const { error } = await client.rpc("platform_template", { template_id: input.templateId, payload: input.document, publish: input.published });
      databaseError(error);
    } else if (input.section === "plans") {
      if (!Number.isInteger(input.documentLimit) || Number(input.documentLimit) < 1 || !Number.isSafeInteger(input.assetLimit) || Number(input.assetLimit) < 1 || typeof input.plan !== "string" || typeof input.monthlyId !== "string" || typeof input.yearlyId !== "string") throw new HttpError(422, "Invalid plan configuration.");
      const { error } = await client.rpc("platform_plan", { plan_key: input.plan, template_limit: input.documentLimit, storage_limit: input.assetLimit, monthly_provider: input.monthlyId, yearly_provider: input.yearlyId });
      databaseError(error);
    } else if (input.section === "roles") {
      if (typeof input.email !== "string" || input.email.length > 254 || !["super_admin","operations","billing","support","content","remove"].includes(String(input.role))) throw new HttpError(422, "Invalid role assignment.");
      const { error } = await client.rpc("platform_role", { member_email: input.email, selected_role: input.role });
      if (error?.message.includes("member_unavailable")) throw new HttpError(422, "Use an existing verified account other than your own.");
      databaseError(error);
    } else throw new HttpError(405, "This section is read-only.");
    return Response.json({ ok: true });
  });
}
