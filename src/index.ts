import { createBackendServer } from "./server.js";

process.env.NODE_ENV ||= "production";

const port = Number(process.env.PORT || 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
const server = createBackendServer();
server.listen(port, process.env.HOST || "127.0.0.1", () => {
  console.info("backend_listening", { port, mode: process.env.APP_MODE || "demo" });
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
