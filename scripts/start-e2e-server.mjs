import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const standaloneRoot = join(projectRoot, ".next", "standalone");

// Match the production Docker image layout before starting the traced server.
mkdirSync(join(standaloneRoot, ".next"), { recursive: true });
cpSync(join(projectRoot, "public"), join(standaloneRoot, "public"), { recursive: true });
cpSync(join(projectRoot, ".next", "static"), join(standaloneRoot, ".next", "static"), { recursive: true });

const child = spawn(process.execPath, ["server.js"], {
  cwd: standaloneRoot,
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: process.env.PORT || "3105" },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
