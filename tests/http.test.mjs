import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
process.env.APP_MODE = "demo";
process.env.APP_URL = "https://app.example.test";
const { dispatch } = await import("../dist/server.js");
const { cookies, withCookies } = await import("../dist/lib/cookies.js");
const { body, readBytes } = await import("../dist/lib/server/http.js");

test("standalone API routes preserve status, JSON, method handling and no-store", async () => {
  const health = await dispatch(new Request("http://service/api/health"));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", mode: "demo" });
  assert.equal(health.headers.get("cache-control"), "private, no-store");
  assert.equal((await dispatch(new Request("http://service/api/does-not-exist"))).status, 404);
  const method = await dispatch(new Request("http://service/api/health", { method: "POST" }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
  assert.equal((await dispatch(new Request("http://service/api/resources/unknown"))).status, 404);
});
test("auth and mutation endpoints fail closed without changing demo behavior", async () => {
  const session = await dispatch(new Request("http://service/api/session"));
  assert.equal(session.status, 503);
  const wrongOrigin = await dispatch(new Request("http://service/api/auth", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: '{"action":"signin"}' }));
  assert.equal(wrongOrigin.status, 403);
  const validOrigin = await dispatch(new Request("http://service/api/auth", { method: "POST", headers: { origin: process.env.APP_URL, "content-type": "application/json" }, body: '{"action":"signin"}' }));
  assert.equal(validOrigin.status, 503);
});
test("callback still redirects to the frontend with an explicit error", async () => {
  const response = await dispatch(new Request("http://service/auth/callback?next=https://attacker.example"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://app.example.test/login?error=confirmation");
});
test("request cookie jars isolate concurrent users and preserve multiple Set-Cookie headers", async () => {
  const results = await Promise.all(["alice", "bob"].map(user => withCookies(new Request("http://service", { headers: { cookie: `session=${user}` } }), async () => {
    assert.equal(cookies().get("session").value, user);
    await setTimeout(user === "alice" ? 5 : 1);
    assert.equal(cookies().get("session").value, user);
    cookies().set("session", `${user}-refreshed`, { path: "/", httpOnly: true, sameSite: "lax" });
    cookies().set("workspace", user, { path: "/" });
    return Response.redirect("https://app.example.test/dashboard");
  })));
  results.forEach((result, index) => {
    const user = ["alice", "bob"][index];
    const values = result.headers.getSetCookie();
    assert.equal(values.length, 2);
    assert.ok(values[0].includes(`session=${user}-refreshed`));
    assert.ok(values[0].includes("HttpOnly"));
    assert.ok(values[1].includes(`workspace=${user}`));
  });
  assert.throws(() => cookies(), /request context/);
});
test("body limits use actual bytes and reject malformed JSON", async () => {
  await assert.rejects(readBytes(new Request("http://service", { method: "POST", body: "123456" }), 5), error => error.status === 413);
  await assert.rejects(body(new Request("http://service", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), error => error.status === 400);
  await assert.rejects(body(new Request("http://service", { method: "POST", body: "{}" })), error => error.status === 415);
});
