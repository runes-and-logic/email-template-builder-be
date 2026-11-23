import { cloudMode } from "../../../lib/config.js";
import { serverClient } from "../../../lib/supabase/server.js";
export async function GET() {
  if (!cloudMode) return Response.json({ status: "ok", mode: "demo" });
  try {
    const client = await serverClient();
    const { error } = await client.from("plans").select("id").limit(1);
    if (error) throw error;
    return Response.json({ status: "ok", mode: "cloud" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", mode: "cloud" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
