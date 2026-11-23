import { serverClient } from "../../../lib/supabase/server.js";
import { databaseError, endpoint } from "../../../lib/server/http.js";
export async function GET() {
  return endpoint(async () => {
    const client = await serverClient();
    const { data, error } = await client.from("template_catalog").select("id,name,category,content").eq("published", true).order("updated_at", { ascending: false }).limit(100);
    databaseError(error);
    return Response.json({ templates: data });
  });
}
