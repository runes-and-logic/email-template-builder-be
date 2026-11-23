import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyWebhook(raw: string, signature: string | null, secret: string) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
