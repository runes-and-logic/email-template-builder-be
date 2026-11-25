# Postly cloud setup and operations

The projects are separate applications:

- `email-template-builder`: Next.js customer frontend on port 3000.
- `email-template-builder-admin`: Next.js admin frontend on port 3001. In cloud mode it redirects to the customer's `/platform` UI.
- `email-template-builder-be`: standalone Node.js/TypeScript backend on port 3002. All API handlers, authentication, authorization, provider integrations, migrations, and database tests live here. It does not depend on Next.js or either frontend repository.

The customer frontend proxies `/api/*` and `/auth/*` to `BACKEND_URL` using Next.js rewrites. Browsers keep same-origin URLs and HttpOnly cookies; the backend validates each operation. The frontend session guard handles sign-in navigation only and is not an authorization boundary. No cross-domain cookies, browser provider credentials, or permissive CORS are required.

## Local demo

Use Node 22.18 or later. In each project run `npm ci`. The customer demo still works without starting the backend. For the separate API, run `npm run dev` in this backend directory; it compiles TypeScript and watches source/output changes. The frontend runs with `npm run dev` on port 3000. Demo data is never automatically uploaded.

Backend deployment uses `npm ci --include=dev && npm run build`, then `npm start`. Set `HOST=0.0.0.0` when the hosting platform requires it, and set `NODE_ENV=production`. Its environment is loaded from `.env.local` for local commands; hosts may inject environment variables directly.

## Configure cloud services

1. In **this backend directory**, copy `.env.example` to `.env.local`. Set `APP_MODE=cloud`, `APP_URL` to the customer frontend origin (locally `http://localhost:3000`), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. All Supabase, Razorpay, and Resend credentials belong only here. In the customer frontend's `.env.local`, set `NEXT_PUBLIC_APP_MODE=cloud` and `BACKEND_URL=http://127.0.0.1:3002` (or the deployed backend origin). Build-time frontend rewrites require rebuilding when `BACKEND_URL` changes. Both projects must use matching demo/cloud modes.
2. Apply **all** SQL files in `supabase/migrations/` in filename order using Supabase migrations or its SQL editor. They create the schema, grants, policies, functions, public raster-image bucket, plans, and all eleven existing templates. Do not run the seed generator again during deployment; its generated migration is committed source.
3. In Supabase Auth, enable email confirmation, set the site URL, and allow `${APP_URL}/auth/callback` and `${APP_URL}/auth/callback?next=/account/password`. Configure production SMTP, password policy, email rate limits, CAPTCHA/abuse controls as required, and disable unused auth providers. Account signup, confirmation, login, reset, password change, and logout use Supabase Auth.
4. Create and confirm the first operator account. Bootstrap its role once through an administrator database connection:

   ```sql
   insert into public.platform_admins(user_id,role)
   select id,'super_admin' from auth.users
   where email='REPLACE_WITH_VERIFIED_OPERATOR_EMAIL' and email_confirmed_at is not null;
   ```

   Afterwards manage operator roles through `/platform`. Users cannot grant themselves administrator access.
5. Create monthly and yearly Razorpay subscription plans in **test mode** matching the displayed INR prices in `public.plans`. Store the provider plan IDs using Platform administration → Plans. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` on the server.
6. Register `https://YOUR_BACKEND_HOST/api/webhooks/razorpay` (or the equivalent customer-domain proxy URL) for subscription events, including activated, charged, pending, halted, paused, resumed, cancelled, completed, and authenticated. Webhooks must be publicly reachable over HTTPS. The handler verifies raw-body signatures, fetches current provider state, validates checkout/plan mapping, and commits deduplication and entitlements atomically. Paid access comes only from an active subscription with an unexpired current period, never the checkout redirect.
7. Optional test-email delivery: set `RESEND_API_KEY` and a verified `EMAIL_FROM`. Tests go only to the signed-in user's verified address, with a database-backed limit of five attempts per minute. This is not a bulk campaign sender.
8. For the admin deployment set `NEXT_PUBLIC_APP_MODE=cloud` and `CUSTOMER_APP_URL` to the customer deployment. Operator login happens on that domain; no shared cross-domain cookies or public service keys are required.
9. Rebuild after changes to `NEXT_PUBLIC_*`. Run the checks below and complete a test-mode subscription lifecycle before using live Razorpay keys.

## Data behavior

- Workspaces have owner/editor/viewer roles. Owners can add or remove an existing verified account under Account → Team access. Members select their workspace in Account. This is existing-account sharing; invitation email delivery is not implemented.
- Emails save with an expected revision. Stale writes return HTTP 409 and retain the browser recovery copy. Reload the saved email or export current work before reconciling. Restoring a historical version creates a new revision. The latest twenty snapshots per email are retained.
- Gallery selection creates a distinct document and consumes one template slot. Dashboard deletion is recoverable Trash; restoring checks current plan limits.
- Browser imports are explicit, preserve source IDs, and keep local originals. Repeating an already-imported ID reports a conflict rather than creating duplicates. Import can stop at a plan limit; upgrade or free space, then import remaining documents.
- Images in exported emails need stable public URLs. The `email-assets` bucket is public by design. Do not upload confidential assets. Object names are randomized, uploads are limited to 1.5 MB, raster signatures are checked, and storage usage is reserved atomically.
- Documents and brand kits can contain user-provided external URLs. Browser/email clients fetch those URLs. No server-side arbitrary URL fetch/proxy is implemented.
- Pricing and quotas come from database plans. Provider plan prices must be kept consistent with the displayed prices. The current UI configures limits and provider mappings; price changes require a reviewed database migration and new provider plans.

## Verification

In this backend directory:

```sh
npm run typecheck
npm test
npm run test:http
npm run build
npm start
```

In the customer frontend directory, use demo mode for the existing browser regression suite. Cloud acceptance is a separate check below. If testing cloud mode on port 3100, set the backend `APP_URL` to `http://localhost:3100` so origin validation matches.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start -- --port 3100
# Separate terminal, same frontend directory:
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

`npm run test:proxy` in the frontend verifies the compiled Next.js proxy against an isolated HTTP fixture on port 3002. Run it with the frontend server on 3100 and the real backend stopped; the fixture checks raw bodies, incoming cookies, multiple Set-Cookie headers, redirects, status codes, query strings, and streamed requests. The demo browser suite does not need a backend.

The backend test suite checks request-scoped cookie isolation and HTTP handler contracts in addition to the existing database/security tests. Hosted Supabase Auth/Storage and Razorpay sandbox verification still require real credentials.

Unit tests cover rendering, validation, signatures, and image headers. Run dependency audits independently in each project. Embedded PostgreSQL tests apply the migrations with minimal Supabase-owned `auth`/`storage` fixture schemas and exercise permissions, revisions, quotas, membership, checkout serialization, and webhook transactions. They do not replace hosted Supabase Auth/Storage or Razorpay sandbox checks.

Cloud acceptance checklist:

- Sign up → confirm → sign in → create/edit/autosave → reload from another browser → export.
- Owner grants viewer/editor access; viewer cannot mutate; removing membership immediately denies data access.
- Browser originals survive import; stale edits produce a conflict; revision restore and Trash restore work.
- Raster upload returns a public URL and persists within quota; spoofed formats and over-quota requests fail.
- Test checkout → provider activation → webhook → entitlement update. Replay the same event; verify a single effect. Cancel at period end; verify access expires correctly.
- Ordinary users get 403 from admin APIs; content operators cannot read billing; billing operators cannot grant roles.
- Missing service configuration returns a clear failure; cloud mode never switches to browser-only storage.

## Operations and failure recovery

- `/api/health` returns 200 when the public database read succeeds, otherwise 503. Configure external uptime checks and alerts. This is a readiness check, not a guarantee of every provider's health.
- Server failures emit structured event names without document content, passwords, tokens, or payment payloads. Connect hosting logs to your error/alert system. Full application error tracking and dashboards still need a chosen monitoring account.
- Enable managed database backups/PITR and storage backups. Test restoration into an isolated project before accepting paid customers. Document revision history is not a backup.
- Deploy migrations before application code, validate in staging, and keep the previous application artifact for rollback. Schema rollbacks require reviewed migrations; do not drop tables to roll back a deploy.
- A checkout is locked before contacting Razorpay. If the provider request times out, its outcome may be unknown; the application intentionally refuses to create a second subscription. Operators must inspect Razorpay subscriptions by the stored checkout token, then repair `billing_checkouts` with the matching provider ID/short URL or mark it `closed` only after confirming no subscription was created. Do not clear locks blindly.
- Webhook failures return non-2xx for provider retries. Monitor delivery failures. Reconcile provider state against `subscriptions` periodically; scheduled reconciliation and invoice/refund administration are future work.
- Retain Trash, revisions, audits, and rate-limit records according to an approved retention policy. Permanent erasure, account deletion/export automation, legal policies, production support contacts, MFA rollout, and retention jobs require operational configuration and further implementation before a public paid launch.

## Current boundaries

Implemented: accounts, workspace permissions, cloud documents/resources, autosave/recovery, history, Trash, catalog publishing, role-scoped administration, quotas, raster uploads, subscription checkout/cancellation/webhooks, self-addressed test email, CI, and readiness checks.

Not implemented: bulk campaigns, audience/contact management, ESP connectors, real-time collaboration, invoice/refund workflows, support-ticket delivery, CMS publishing, product analytics, error-monitoring vendor setup, automated backups/retention jobs, and email-client screenshot services. The original admin demo retains its illustrative screens; cloud administration exposes only connected operations.


## Shared browser-safe email core

`packages/email-core/src/` owns the common document types, validation, sample catalog, email renderer, and checks. It contains no service credentials, database access, cookies, or browser storage. The backend consumes it as a local package. The frontend commits a compiled `vendor/postly-email-core-<version>.tgz`, so it can install and deploy without cloning the backend.

When changing the shared core, **always bump the version** in `packages/email-core/package.json` first (build caches such as Vercel's can reuse a same-version tarball and ship stale code). Then run `npm run core:sync` here, install the new tarball in the customer frontend with `npm install ./vendor/postly-email-core-<version>.tgz`, and delete the old tarball. Commit the source change, the new artifact and the frontend `package.json`/lockfile together. Browser localStorage functions remain in the frontend's `lib/workspace.ts`.

## Existing environment files

Earlier setup instructions placed provider variables in the customer frontend. If you followed those instructions, move them into the backend `.env.local` and rename `NEXT_PUBLIC_SUPABASE_URL` to `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `SUPABASE_ANON_KEY`, and the backend mode to `APP_MODE`. Remove provider credentials from frontend deployment settings. The frontend now needs only its UI mode and backend origin. Keep `APP_URL` as the customer origin, not the backend origin, to preserve CSRF validation and email callback links.
