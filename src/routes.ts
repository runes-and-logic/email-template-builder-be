import * as route0 from "./routes/api/account/password/route.js";
import * as route1 from "./routes/api/billing/cancel/route.js";
import * as route2 from "./routes/api/billing/checkout/route.js";
import * as route3 from "./routes/api/email/test/route.js";
import * as route4 from "./routes/api/webhooks/razorpay/route.js";
import * as route5 from "./routes/api/workspaces/members/route.js";
import * as route6 from "./routes/api/account/route.js";
import * as route7 from "./routes/api/admin/route.js";
import * as route8 from "./routes/api/assets/route.js";
import * as route9 from "./routes/api/auth/route.js";
import * as route10 from "./routes/api/catalog/route.js";
import * as route11 from "./routes/api/documents/route.js";
import * as route12 from "./routes/api/health/route.js";
import * as route13 from "./routes/api/plans/route.js";
import * as route14 from "./routes/api/session/route.js";
import * as route15 from "./routes/api/workspaces/route.js";
import * as route16 from "./routes/auth/callback/route.js";
import * as route17 from "./routes/api/documents/[id]/versions/route.js";
import * as route18 from "./routes/api/assets/[id]/route.js";
import * as route19 from "./routes/api/documents/[id]/route.js";
import * as route20 from "./routes/api/resources/[kind]/route.js";

export type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
export const routes = [
  { pattern: /^\/api\/account\/password\/?$/, params: [], handlers: route0 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/billing\/cancel\/?$/, params: [], handlers: route1 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/billing\/checkout\/?$/, params: [], handlers: route2 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/email\/test\/?$/, params: [], handlers: route3 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/webhooks\/razorpay\/?$/, params: [], handlers: route4 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/workspaces\/members\/?$/, params: [], handlers: route5 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/account\/?$/, params: [], handlers: route6 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/admin\/?$/, params: [], handlers: route7 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/assets\/?$/, params: [], handlers: route8 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/auth\/?$/, params: [], handlers: route9 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/catalog\/?$/, params: [], handlers: route10 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/documents\/?$/, params: [], handlers: route11 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/health\/?$/, params: [], handlers: route12 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/plans\/?$/, params: [], handlers: route13 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/session\/?$/, params: [], handlers: route14 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/workspaces\/?$/, params: [], handlers: route15 as unknown as Record<string, Handler> },
  { pattern: /^\/auth\/callback\/?$/, params: [], handlers: route16 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/documents\/([^\/]+)\/versions\/?$/, params: ["id"], handlers: route17 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/assets\/([^\/]+)\/?$/, params: ["id"], handlers: route18 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/documents\/([^\/]+)\/?$/, params: ["id"], handlers: route19 as unknown as Record<string, Handler> },
  { pattern: /^\/api\/resources\/([^\/]+)\/?$/, params: ["kind"], handlers: route20 as unknown as Record<string, Handler> }
];
