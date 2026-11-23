import { body, context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";
import { validDocument } from "@postly/email-core/workspace";
import { documentHtml } from "@postly/email-core/email";
import { plainText } from "@postly/email-core/email-checks";
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, user } = await context();
    if (!user.email || !user.email_confirmed_at) throw new HttpError(403, "Confirm your account email first.");
    const input = await body(request);
    if (!validDocument(input.document) || !input.document.subject?.trim()) throw new HttpError(422, "Add a subject before sending a test.");
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new HttpError(503, "Test email delivery is not configured.");
    const { data: allowed, error } = await client.rpc("consume_rate", { action_name: "test_email" });
    databaseError(error);
    if (!allowed) throw new HttpError(429, "Please wait a minute before sending another test.");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [user.email], subject: `[Test] ${input.document.subject}`, html: documentHtml(input.document), text: plainText(input.document) }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new HttpError(503, "Email delivery failed. Please try again later.");
    return Response.json({ ok: true });
  });
}
