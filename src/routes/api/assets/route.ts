import { context, databaseError, endpoint, HttpError, sameOrigin, readBytes } from "../../../lib/server/http.js";
import { imageType } from "../../../lib/image-validation.js";
import { serviceClient } from "../../../lib/supabase/service.js";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { client, workspaceId } = await context();
    const page = Math.max(0, Math.min(10000, Number(new URL(request.url).searchParams.get("page")) || 0));
    const { data, error, count } = await client.from("assets").select("id,object_key,size,mime,created_at", { count: "exact" }).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
    databaseError(error);
    const storage = client.storage.from("email-assets");
    return Response.json({ assets: data?.map(asset => ({ ...asset, url: storage.getPublicUrl(asset.object_key).data.publicUrl })), count });
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    sameOrigin(request);
    const { client, workspaceId } = await context(true);
    const bytesBody = await readBytes(request, 1600000);
    const data = await new Response(bytesBody, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const file = data.get("file");
    if (!(file instanceof File) || file.size < 12 || file.size > 1500000) throw new HttpError(422, "Choose an image under 1.5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = imageType(bytes);
    if (!mime || mime !== file.type) throw new HttpError(422, "The file is not a supported raster image.");
    const id = crypto.randomUUID();
    const admin = serviceClient();
    const path = `${workspaceId}/${id}/image.${mime.split("/")[1]}`;
    const { error } = await client.rpc("reserve_asset", { w: workspaceId, asset_id: id, object_path: path, byte_size: file.size, mime_type: mime });
    databaseError(error);
    const storage = admin.storage.from("email-assets");
    const { error: uploadError } = await storage.upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
    if (uploadError) {
      const cleanup = await storage.remove([path]);
      if (!cleanup.error) await admin.from("assets").delete().eq("id", id).eq("workspace_id", workspaceId);
      throw new HttpError(503, "Upload failed. Please try again.");
    }
    return Response.json({ id, url: storage.getPublicUrl(path).data.publicUrl });
  });
}
