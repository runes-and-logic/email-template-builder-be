import { endpoint, identity } from "../../../lib/server/http.js";
export async function GET() {
  return endpoint(async () => {
    const { user } = await identity();
    return Response.json({ authenticated: true, user: { id: user.id, email: user.email } });
  });
}
