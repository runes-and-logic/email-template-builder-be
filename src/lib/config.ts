export const cloudMode = process.env.APP_MODE === "cloud";
/** Paid checkout is on hold unless explicitly enabled. Existing subscriptions can still be cancelled and webhooks still apply. */
export const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. See the backend .env.example.");
  return { url, key };
}
