import { body, context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";
import { razorpay, type Subscription } from "../../../../lib/server/razorpay.js";
import { serviceClient } from "../../../../lib/supabase/service.js";
import { paymentsEnabled } from "../../../../lib/config.js";
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    if (!paymentsEnabled) throw new HttpError(503, "Paid plans are paused for now. You can keep using the Free plan.");
    const { client, workspaceId, role } = await context();
    if (role !== "owner") throw new HttpError(403, "Only workspace owners can manage billing.");
    const input = await body(request, 1000);
    if (!["starter","pro","business"].includes(String(input.plan)) || !["monthly","yearly"].includes(String(input.interval))) throw new HttpError(422, "Choose a valid plan and billing period.");
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, "Billing is not configured.");
    const { data: allowed, error: rateError } = await client.rpc("consume_rate", { action_name: "checkout" });
    databaseError(rateError);
    if (!allowed) throw new HttpError(429, "Please wait before starting another checkout.");
    const { data: plan, error: planError } = await client.from("plans").select("razorpay_monthly_id,razorpay_yearly_id,monthly_paise,yearly_paise").eq("id", input.plan).single();
    databaseError(planError);
    const providerPlan = input.interval === "monthly" ? plan?.razorpay_monthly_id : plan?.razorpay_yearly_id;
    if (!providerPlan) throw new HttpError(503, "This billing plan is not configured yet.");
    const provider = await razorpay<{ period: string; interval: number; item: { amount: number; currency: string } }>(`plans/${encodeURIComponent(providerPlan)}`);
    const amount = input.interval === "monthly" ? plan?.monthly_paise : plan?.yearly_paise;
    if (provider.period !== input.interval || provider.interval !== 1 || provider.item.currency !== "INR" || provider.item.amount !== amount) throw new HttpError(503, "Billing plan configuration does not match the displayed price.");
    const { data: checkout, error } = await client.rpc("claim_checkout", { w: workspaceId, selected_plan: input.plan, billing_interval: input.interval });
    if (error?.message.includes("subscription_exists")) throw new HttpError(409, "A subscription already exists. Cancel it before starting a new one.");
    if (error?.message.includes("checkout_in_progress")) throw new HttpError(409, "A checkout is being prepared. If this persists, contact support before trying again.");
    databaseError(error);
    if (checkout.plan_id !== input.plan || checkout.interval !== input.interval) throw new HttpError(409, `A ${checkout.interval} ${checkout.plan_id} checkout is already open. Select that plan to resume it, or contact support to close it.`);
    if (checkout.checkout_url) return Response.json({ url: checkout.checkout_url });
    const subscription = await razorpay<Subscription>("subscriptions", { plan_id: providerPlan, total_count: input.interval === "monthly" ? 120 : 10, quantity: 1, customer_notify: true, notes: { workspace_id: workspaceId, checkout_token: checkout.token } });
    const url = new URL(subscription.short_url);
    if (url.protocol !== "https:" || !["rzp.io","razorpay.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new HttpError(503, "Invalid checkout URL from provider.");
    const { error: updateError } = await serviceClient().from("billing_checkouts").update({ provider_id: subscription.id, checkout_url: subscription.short_url, state: "ready" }).eq("workspace_id", workspaceId).eq("token", checkout.token);
    databaseError(updateError);
    return Response.json({ url: subscription.short_url });
  });
}
