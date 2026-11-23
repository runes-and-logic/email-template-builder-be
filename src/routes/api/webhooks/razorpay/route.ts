import { endpoint, HttpError, databaseError, readBytes } from "../../../../lib/server/http.js";
import { verifyWebhook } from "../../../../lib/webhook.js";
import { razorpay, type Subscription } from "../../../../lib/server/razorpay.js";
import { serviceClient } from "../../../../lib/supabase/service.js";
export async function POST(request: Request) {
  return endpoint(async () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Webhook is not configured.");
    const raw = new TextDecoder().decode(await readBytes(request, 1000000));
    if (!verifyWebhook(raw, request.headers.get("x-razorpay-signature"), secret)) throw new HttpError(400, "Invalid webhook signature.");
    const eventId = request.headers.get("x-razorpay-event-id");
    if (!eventId || eventId.length > 200) throw new HttpError(400, "Missing event ID.");
    let event;
    try { event = JSON.parse(raw); } catch { throw new HttpError(400, "Invalid event JSON."); }
    const id = event.payload?.subscription?.entity?.id;
    if (typeof event.event !== "string" || !event.event.startsWith("subscription.") || typeof id !== "string") return Response.json({ ignored: true });
    const admin = serviceClient();
    const { data: duplicate, error: duplicateError } = await admin.from("webhook_events").select("provider_event_id").eq("provider_event_id", eventId).maybeSingle();
    databaseError(duplicateError);
    if (duplicate) return Response.json({ duplicate: true });
    // Re-fetch current provider state; event payloads may arrive out of order.
    const observed = new Date().toISOString();
    const subscription = await razorpay<Subscription>(`subscriptions/${encodeURIComponent(id)}`);
    const workspace = subscription.notes.workspace_id;
    const { data: checkout, error: checkoutError } = await admin.from("billing_checkouts").select("workspace_id,plan_id,token,provider_id").eq("workspace_id", workspace).maybeSingle();
    databaseError(checkoutError);
    if (!checkout || checkout.token !== subscription.notes.checkout_token || checkout.provider_id !== subscription.id) throw new HttpError(409, "Checkout mapping is not ready.");
    const { data: plan, error } = await admin.from("plans").select("id,razorpay_monthly_id,razorpay_yearly_id").eq("id", checkout.plan_id).single();
    databaseError(error);
    if (!plan || ![plan.razorpay_monthly_id,plan.razorpay_yearly_id].includes(subscription.plan_id)) throw new HttpError(400, "Provider plan mismatch.");
    const { error: applyError } = await admin.rpc("apply_subscription_event", { event_id: eventId, event_name: event.event, w: checkout.workspace_id, subscription_id: subscription.id, selected_plan: plan.id, subscription_status: subscription.status, ends_at: subscription.current_end ? new Date(subscription.current_end * 1000).toISOString() : null, observed });
    databaseError(applyError);
    return Response.json({ ok: true });
  });
}
