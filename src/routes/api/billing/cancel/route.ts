import { context, databaseError, endpoint, HttpError, sameOrigin } from "../../../../lib/server/http.js";
import { razorpay } from "../../../../lib/server/razorpay.js";
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, workspaceId, role } = await context();
    if (role !== "owner") throw new HttpError(403, "Only workspace owners can manage billing.");
    const { data: subscription, error } = await client.from("subscriptions").select("provider_id,status").eq("workspace_id", workspaceId).single();
    databaseError(error);
    if (!subscription || subscription.status !== "active") throw new HttpError(409, "No active subscription to cancel.");
    await razorpay(`subscriptions/${encodeURIComponent(subscription.provider_id)}/cancel`, { cancel_at_cycle_end: true });
    return Response.json({ message: "Cancellation requested for the end of the billing period. Your paid access continues through the current period." });
  });
}
