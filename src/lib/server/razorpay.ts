import { HttpError } from "./http.js";
export type Subscription = { id: string; plan_id: string; status: string; current_end: number | null; short_url: string; notes: { workspace_id?: string; checkout_token?: string } };
export async function razorpay<T>(path: string, body?: unknown): Promise<T> {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new HttpError(503, "Billing is not configured.");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new HttpError(503, "Billing provider is unavailable. Please try again later.");
  return response.json();
}
