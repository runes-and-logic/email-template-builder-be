import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const destination = new URL("../../email-template-builder/vendor/", import.meta.url);
await mkdir(destination, { recursive: true });
execFileSync("npm", ["pack", "./packages/email-core", "--pack-destination", fileURLToPath(destination)], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit",
});
