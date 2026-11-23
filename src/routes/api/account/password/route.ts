import { body, endpoint, HttpError, identity, sameOrigin } from "../../../../lib/server/http.js";
export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client } = await identity();
    const input = await body(request, 1000);
    if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) throw new HttpError(422, "Use a password between 12 and 128 characters.");
    const { error } = await client.auth.updateUser({ password: input.password });
    if (error) throw new HttpError(400, "Unable to change password. Request a fresh reset email and try again.");
    await client.auth.signOut({ scope: "global" });
    return Response.json({ ok: true });
  });
}
