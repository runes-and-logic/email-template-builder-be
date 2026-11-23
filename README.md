# Postly backend

Standalone Node.js/TypeScript API. No Next.js, React, frontend source imports, or UI deployment is required.

```sh
npm ci --include=dev
cp -n .env.example .env.local
npm run dev
```

The backend listens on `127.0.0.1:3002` by default. Set `HOST=0.0.0.0` for a container or remote host. Production uses `npm run build` followed by `npm start`.

| Directory | Responsibility |
| --- | --- |
| `src/routes/api/` | Accounts, sessions, documents, assets, resources, workspaces, admin, billing, email and webhook endpoints |
| `src/routes/auth/` | Authentication callback |
| `src/lib/server/` | Authentication/authorization, request validation, errors and Razorpay adapter |
| `src/lib/supabase/` | User-scoped database/auth clients and server-only service client |
| `src/lib/cookies.ts` | Request-isolated cookie transport and refresh headers |
| `src/server.ts` | HTTP adapter and request limits |
| `src/routes.ts` | Explicit route manifest |
| `supabase/migrations/` | Ordered schema, policy, function and seed migrations |
| `tests/` | Database, permissions, cookie/HTTP and security tests |
| `packages/email-core/` | Shared browser-safe document model, validation and rendering |

The Next.js customer frontend forwards `/api/*` and `/auth/*` to this service through `BACKEND_URL`. Set `APP_URL` here to the customer frontend origin for CSRF checks and email redirects. Supabase, Razorpay, Resend and service-role credentials belong only in this backend's environment.

```sh
npm run typecheck
npm test
```

See [OPERATIONS.md](OPERATIONS.md) for cloud setup, deployment, shared-package updates and remaining launch requirements. Hosted provider checks still require credentials; local tests emulate the Supabase-owned schemas.
