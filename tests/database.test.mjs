import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { fromTemplate } from "@postly/email-core/workspace";
import { templates } from "@postly/email-core/data";
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const charlie = "33333333-3333-4333-8333-333333333333";
let workspace;
async function asUser(id, run) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try { return await run(); } finally { await db.exec("reset role"); }
}
const document = id => ({ ...fromTemplate(templates[0]), id, subject: "Hello" });
before(async () => {
  // Supabase-owned schemas are emulated; application migrations run unchanged except pgcrypto setup.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    grant usage on schema public to authenticated,anon,service_role;
    grant select,insert,delete on storage.objects to authenticated;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
    const sql = (await readFile(new URL(name, directory), "utf8")).replace("create extension if not exists pgcrypto;", "");
    try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${name}: ${error.message}`, { cause: error }); }
  }
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'alice@example.com',now()),($2,'bob@example.com',now()),($3,'charlie@example.com',now())", [alice,bob,charlie]);
  workspace = await asUser(alice, async () => (await db.query("select ensure_workspace() as id")).rows[0].id);
});
after(async () => { await db.close(); });

test("migrations seed all existing catalog templates", async () => {
  const { rows } = await db.query("select count(*)::int as count from template_catalog where published");
  assert.equal(rows[0].count, 11);
});
test("tenant isolation, viewer permissions, and revoked direct writes", async () => {
  await asUser(alice, () => db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(document("email-one"))]));
  await asUser(bob, async () => {
    assert.equal((await db.query("select * from documents")).rows.length, 0);
    await assert.rejects(db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(document("stolen"))]), /insufficient_privilege|permission/i);
  });
  await db.query("insert into workspace_members values($1,$2,'viewer')", [workspace,bob]);
  await asUser(bob, async () => {
    assert.equal((await db.query("select * from documents")).rows.length, 1);
    await assert.rejects(db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(document("viewer-write"))]), /insufficient_privilege|permission/i);
    await assert.rejects(db.query("update documents set name='Bypassed'"), /permission denied/i);
    await assert.rejects(db.query("delete from assets"), /permission denied/i);
  });
});
test("stale edits fail atomically and revisions are immutable", async () => {
  await asUser(alice, async () => {
    const updated = document("email-one"); updated.name = "Updated";
    await db.query("select save_document($1,$2::jsonb,1)", [workspace,JSON.stringify(updated)]);
    await assert.rejects(db.query("select save_document($1,$2::jsonb,1)", [workspace,JSON.stringify(updated)]), /revision_conflict/);
    await assert.rejects(db.query("select save_document($1,$2::jsonb,null)", [workspace,JSON.stringify(updated)]), /revision_conflict/);
    assert.equal((await db.query("select revision from document_versions where document_id='email-one' order by revision")).rows.length, 2);
    await assert.rejects(db.query("delete from document_versions"), /permission denied/);
  });
});
test("database validates direct RPC input and rejects duplicate blocks", async () => {
  await asUser(alice, async () => {
    const invalid = document("invalid"); invalid.blocks.push(invalid.blocks[0]);
    await assert.rejects(db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(invalid)]), /valid_document_content/);
    await assert.rejects(db.query("select save_resource($1,'brand','{}'::jsonb,0)", [workspace]), /valid_resource_content/);
    assert.equal((await db.query("select * from documents where id='invalid'")).rows.length, 0);
  });
});
test("template quotas and restore checks are enforced at the database boundary", async () => {
  // Pin the limit this test exercises, independent of the Free plan's current seeded value.
  await db.query("update plans set document_limit=3 where id='free'");
  await asUser(alice, async () => {
    for (const id of ["email-two","email-three"]) await db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(document(id))]);
    await assert.rejects(db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(document("email-four"))]), /quota_exceeded/);
    await db.query("select set_document_deleted($1,'email-three',1,true)", [workspace]);
    await db.query("select save_document($1,$2::jsonb,0)", [workspace,JSON.stringify(document("email-four"))]);
    await assert.rejects(db.query("select set_document_deleted($1,'email-three',2,false)", [workspace]), /quota_exceeded/);
    await db.query("select set_document_deleted($1,'email-four',1,true)", [workspace]);
    await db.query("select set_document_deleted($1,'email-three',2,false)", [workspace]);
  });
});
test("asset quota reservations cannot exceed the plan and clients cannot upload directly", async () => {
  await db.query("update plans set asset_limit=10485760 where id='free'");
  await asUser(alice, async () => {
    for (let index = 0; index < 6; index++) {
      const id = crypto.randomUUID();
      await db.query("select reserve_asset($1,$2,$3,1500000,'image/png')", [workspace,id,`${workspace}/${id}/image.png`]);
    }
    const id = crypto.randomUUID();
    await assert.rejects(db.query("select reserve_asset($1,$2,$3,1500000,'image/png')", [workspace,id,`${workspace}/${id}/image.png`]), /quota_exceeded/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('email-assets',$1)", [`${workspace}/${id}/image.png`]), /row-level security|permission denied/);
  });
});
test("test-email rate limits remain bounded when callers request a higher limit", async () => {
  await asUser(alice, async () => {
    for (let index = 0; index < 5; index++) assert.equal((await db.query("select consume_rate('test_email',999999) as allowed")).rows[0].allowed,true);
    assert.equal((await db.query("select consume_rate('test_email',999999) as allowed")).rows[0].allowed,false);
  });
});
test("membership changes require owners and are audited", async () => {
  await asUser(bob, () => assert.rejects(db.query("select manage_member($1,'charlie@example.com','editor')", [workspace]), /permission|insufficient_privilege/i));
  await asUser(alice, () => db.query("select manage_member($1,'charlie@example.com','editor')", [workspace]));
  await asUser(charlie, async () => {
    await db.query("select save_resource($1,'blocks','[]',0)", [workspace]);
    await assert.rejects(db.query("select save_resource($1,'blocks','[]',0)", [workspace]), /revision_conflict/);
    await assert.rejects(db.query("select save_resource($1,'blocks','[]',null)", [workspace]), /revision_conflict/);
    await assert.rejects(db.query("select manage_member($1,'alice@example.com','remove')", [workspace]), /permission|insufficient_privilege/i);
  });
});
test("checkout serialization, webhook deduplication, stale state, and entitlement", async () => {
  let checkout;
  await asUser(alice, async () => {
    checkout = (await db.query("select claim_checkout($1,'pro','monthly') as checkout", [workspace])).rows[0].checkout;
    await assert.rejects(db.query("select claim_checkout($1,'pro','monthly')", [workspace]), /checkout_in_progress/);
    await assert.rejects(db.query("select apply_subscription_event('fake','subscription.activated',$1,'sub_test','pro','active',now()+interval '1 month',now())", [workspace]), /permission denied/);
  });
  await db.query("update billing_checkouts set provider_id='sub_test',state='ready',checkout_url='https://rzp.io/test' where token=$1", [checkout.token]);
  await db.exec("set role service_role");
  const apply = (event, status, observed) => db.query("select apply_subscription_event($1,'subscription.activated',$2,'sub_test','pro',$3,now()+interval '1 month',$4::timestamptz) as applied", [event,workspace,status,observed]);
  try {
    assert.equal((await apply("event-1","active","2026-11-04T12:00:00Z")).rows[0].applied,true);
    assert.equal((await apply("event-1","active","2026-11-04T12:00:00Z")).rows[0].applied,false);
    await apply("event-2","cancelled","2026-11-04T12:02:00Z");
    assert.equal((await apply("event-3","active","2026-11-04T12:01:00Z")).rows[0].applied,false);
    assert.equal((await apply("event-4","active","2026-11-04T12:03:00Z")).rows[0].applied,false);
    assert.equal((await db.query("select status from subscriptions where workspace_id=$1", [workspace])).rows[0].status,"cancelled");
  } finally { await db.exec("reset role"); }
});
test("admin roles cannot self-escalate or cross permission boundaries", async () => {
  await asUser(bob, () => assert.rejects(db.query("select platform_records('users')"), /permission|insufficient_privilege/i));
  await db.query("insert into platform_admins values($1,'content')", [bob]);
  await asUser(bob, async () => {
    const result = (await db.query("select platform_records('templates') as data")).rows[0].data;
    assert.equal(result.count, 11);
    await assert.rejects(db.query("select platform_records('subscriptions')"), /permission|insufficient_privilege/i);
    await assert.rejects(db.query("select platform_role('bob@example.com','super_admin')"), /permission|insufficient_privilege/i);
  });
});
