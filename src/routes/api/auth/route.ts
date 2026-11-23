import { body, endpoint, HttpError, sameOrigin } from "../../../lib/server/http.js";
import { serverClient } from "../../../lib/supabase/server.js";
import { cloudMode } from "../../../lib/config.js";

type AuthFailure = { status?: number; code?: string } | null;

/** Maps provider errors to messages that tell the user what to do next, without revealing whether an account exists. */
function authError(error: AuthFailure, fallbackStatus: number, fallbackMessage: string): HttpError {
  if (!error?.status || error.status >= 500) return new HttpError(503, "Our account service is unavailable right now. Please try again in a few minutes.");
  if (error.status === 429) return new HttpError(429, "Too many attempts. Please wait a minute and try again.");
  if (error.code === "weak_password") return new HttpError(422, "Choose a stronger password: mix words, numbers and symbols.");
  return new HttpError(fallbackStatus, fallbackMessage);
}

export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    if (!cloudMode) throw new HttpError(503, "Authentication is unavailable in demo mode.");
    const input = await body(request, 2000);
    const client = await serverClient();
    if (input.action === "signout") {
      const { error } = await client.auth.signOut();
      if (error) throw new HttpError(503, "Unable to sign out. Please try again.");
      return Response.json({ ok: true });
    }
    if (typeof input.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new HttpError(422, "Enter a valid email address.");
    if (input.action === "reset") {
      await client.auth.resetPasswordForEmail(input.email, { redirectTo: `${process.env.APP_URL}/auth/callback?next=/account/password` });
      return Response.json({ message: "If an account exists, a password reset email is on its way." });
    }
    if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) throw new HttpError(422, "Use a password between 12 and 128 characters.");
    if (input.action === "signup") {
      const { error } = await client.auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: `${process.env.APP_URL}/auth/callback`, data: { name: String(input.name || "").slice(0, 60) } } });
      if (error) throw authError(error, 400, "Unable to create an account. Try signing in or try again later.");
      return Response.json({ message: "Check your email to confirm your account, then sign in." });
    }
    if (input.action !== "signin") throw new HttpError(422, "Unknown authentication action.");
    const { error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw authError(error, 401, "Unable to sign in. Check your credentials and confirm your email.");
    return Response.json({ ok: true });
  });
}
