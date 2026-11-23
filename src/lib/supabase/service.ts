import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../config.js";
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Server service credentials are not configured.");
  return createClient(supabaseConfig().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
