import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (existsSync(".env")) process.loadEnvFile(".env");

const child = spawn(process.execPath, ["--use-env-proxy", "./node_modules/next/dist/bin/next", ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});