import { AsyncLocalStorage } from "node:async_hooks";
import { parse, serialize, type SerializeOptions } from "cookie";

type CookieContext = { values: Map<string, string>; outgoing: string[] };
const storage = new AsyncLocalStorage<CookieContext>();

/** Each request gets an isolated jar; SDK refreshes never leak between users. */
export async function withCookies(request: Request, run: () => Promise<Response>): Promise<Response> {
  const parsed = parse(request.headers.get("cookie") || "");
  const context: CookieContext = {
    values: new Map(Object.entries(parsed).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    outgoing: [],
  };
  return storage.run(context, async () => {
    const response = await run();
    const result = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
    context.outgoing.forEach(value => result.headers.append("Set-Cookie", value));
    return result;
  });
}

export function cookies() {
  const context = storage.getStore();
  if (!context) throw new Error("Cookie access requires a request context.");
  return {
    get(name: string) { const value = context.values.get(name); return value === undefined ? undefined : { name, value }; },
    getAll() { return [...context.values].map(([name, value]) => ({ name, value })); },
    set(name: string, value: string, options?: SerializeOptions) {
      context.values.set(name, value);
      context.outgoing.push(serialize(name, value, options));
    },
  };
}
