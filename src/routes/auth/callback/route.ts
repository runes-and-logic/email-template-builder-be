import { serverClient } from "../../../lib/supabase/server.js";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") === "/account/password" ? "/account/password" : "/dashboard";
  if (code) {
    const client = await serverClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL(next, process.env.APP_URL), 307);
  }
  return Response.redirect(new URL("/login?error=confirmation", process.env.APP_URL), 307);
}
