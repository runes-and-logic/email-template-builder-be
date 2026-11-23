import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { withCookies } from "./lib/cookies.js";
import { endpoint, HttpError } from "./lib/server/http.js";
import { routes, type Handler } from "./routes.js";

export async function dispatch(request: Request): Promise<Response> {
  return withCookies(request, () => endpoint(async () => {
    const path = new URL(request.url).pathname;
    for (const route of routes) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      const method = request.method === "HEAD" ? "GET" : request.method;
      const handler = route.handlers[method] as Handler | undefined;
      if (!handler) return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: Object.keys(route.handlers).join(", ") } });
      const params: Record<string, string> = {};
      try { route.params.forEach((name, index) => { params[name] = decodeURIComponent(match[index + 1]); }); }
      catch { throw new HttpError(400, "Invalid URL parameters."); }
      return handler(request, { params: Promise.resolve(params) });
    }
    throw new HttpError(404, "Endpoint not found.");
  }));
}

async function webRequest(input: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const max = 4_100_000;
  if (Number(headers.get("content-length")) > max) throw new HttpError(413, "Request is too large.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, "Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  const method = input.method || "GET";
  return new Request(new URL(input.url || "/", "http://backend.internal"), {
    method,
    headers,
    ...(method !== "GET" && method !== "HEAD" && size ? { body: Buffer.concat(chunks) } : {}),
  });
}

async function respond(output: ServerResponse, response: Response, head: boolean) {
  output.statusCode = response.status;
  response.headers.forEach((value, name) => { if (name !== "set-cookie") output.setHeader(name, value); });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) output.setHeader("Set-Cookie", cookies);
  output.setHeader("X-Content-Type-Options", "nosniff");
  output.setHeader("Cache-Control", "private, no-store");
  if (head) { output.end(); return; }
  output.end(Buffer.from(await response.arrayBuffer()));
}

export function createBackendServer() {
  const server = createServer(async (request, response) => {
    try { await respond(response, await dispatch(await webRequest(request)), request.method === "HEAD"); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      await respond(response, Response.json({ error: error instanceof HttpError ? error.message : "The service is unavailable. Please try again." }, { status }), false);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
