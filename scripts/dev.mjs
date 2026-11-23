import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["node_modules/typescript/bin/tsc", "--watch", "--preserveWatchOutput"], { stdio: "inherit" }),
  spawn(process.execPath, ["--env-file-if-exists=.env.local", "--watch", "dist/index.js"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill("SIGTERM"));
  process.exitCode = code;
}
children.forEach(child => child.on("exit", code => stop(code || 0)));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
