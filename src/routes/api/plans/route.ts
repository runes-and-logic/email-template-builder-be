import { endpoint, databaseError } from "../../../lib/server/http.js";
import { serverClient } from "../../../lib/supabase/server.js";
import { paymentsEnabled } from "../../../lib/config.js";
export async function GET() {
  return endpoint(async () => {
    const client = await serverClient();
    const { data, error } = await client.from("plans").select("id,name,monthly_paise,yearly_paise,document_limit,asset_limit").order("monthly_paise");
    databaseError(error);
    return Response.json({ plans: data, paymentsEnabled });
  });
}
