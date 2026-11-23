import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "../dist/lib/webhook.js";
import { imageType } from "../dist/lib/image-validation.js";
test("webhook verification rejects tampering, malformed signatures and empty secrets", () => {
  const raw = '{"event":"subscription.activated"}';
  const signature = createHmac("sha256", "secret").update(raw).digest("hex");
  assert.ok(verifyWebhook(raw, signature, "secret"));
  assert.equal(verifyWebhook(raw + " ", signature, "secret"),false);
  assert.equal(verifyWebhook(raw, "bad", "secret"),false);
  assert.equal(verifyWebhook(raw, signature, ""),false);
});
test("image signatures reject SVG and misleading MIME labels", () => {
  assert.equal(imageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),null);
  assert.equal(imageType(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])),"image/png");
});
