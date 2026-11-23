// `pnpm dev`: the auth API (server/, API only) and `next dev` side by side.
// next.config.ts passes /api through to the API, so the app sees one origin.
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authPort = process.env.AUTH_PORT ?? "3001";

const api = spawn(process.execPath, [resolve(root, "server/index.mjs")], {
  stdio: "inherit",
  env: { ...process.env, API_ONLY: "1", PORT: authPort, HOST: "127.0.0.1" },
});
const next = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, AUTH_PORT: authPort },
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  api.kill();
  next.kill();
  process.exit(code ?? 0);
}
api.on("exit", (code) => stop(code ?? 1));
next.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
