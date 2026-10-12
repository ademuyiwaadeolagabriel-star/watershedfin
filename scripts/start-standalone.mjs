import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const server = ".next/standalone/server.js";

if (!existsSync(server)) {
  console.error("Standalone server not found. Run npm run build first.");
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Failed to start standalone server:", error.message);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
