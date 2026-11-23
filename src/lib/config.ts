export const cloudMode = process.env.APP_MODE === "cloud";
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. See the backend .env.example.");
  return { url, key };
}
