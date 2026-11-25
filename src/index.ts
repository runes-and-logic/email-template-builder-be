import { createBackendServer } from "./server.js";

process.env.NODE_ENV ||= "production";

const port = Number(process.env.PORT || 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
const server = createBackendServer();
// Local runs stay on 127.0.0.1. Hosting platforms (Render sets RENDER=true) need every interface,
// so the platform's port scan and proxy can reach the server even if HOST was not configured.
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
server.listen(port, host, () => {
  console.info("backend_listening", { host, port, mode: process.env.APP_MODE || "demo" });
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
