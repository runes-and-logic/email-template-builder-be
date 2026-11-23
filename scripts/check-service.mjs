import assert from "node:assert/strict";
process.env.APP_MODE = "demo";
process.env.APP_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const { createBackendServer } = await import("../dist/server.js");
const server = createBackendServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(process.env.FRONTEND_URL ? 3002 : 0, "127.0.0.1", resolve); });
const direct = `http://127.0.0.1:${server.address().port}`;
try {
  for (const base of [direct, ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])]) {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", mode: "demo" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  const head = await fetch(`${direct}/api/health`, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  const denied = await fetch(`${direct}/api/auth`, { method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(denied.status, 403);
  assert.equal((await fetch(`${direct}/api/documents/example`)).status, 503);
  console.log("PASS: standalone HTTP server, readiness, HEAD handling, origin checks, and protected routes" + (process.env.FRONTEND_URL ? ", including the live frontend proxy" : ""));
} finally { await new Promise(resolve => server.close(resolve)); }
