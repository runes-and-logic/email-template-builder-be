import { createServerClient } from "@supabase/ssr";
import { cookies } from "../cookies.js";
import { supabaseConfig } from "../config.js";

export async function serverClient() {
  const { url, key } = supabaseConfig();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) => jar.set(name, value, options));
      },
    },
  });
}
