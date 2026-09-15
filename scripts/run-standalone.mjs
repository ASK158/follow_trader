import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const standaloneDirectory = resolve(root, ".next", "standalone");
const serverPath = resolve(standaloneDirectory, "server.js");

if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));

if (!existsSync(serverPath)) {
  console.error("未找到生产构建，请先运行 npm run build");
  process.exit(1);
}

// standalone server 会将 cwd 切换到自身目录；必须使用绝对数据路径，避免生成第二份数据库。
process.env.SIGNAL_DATA_DIR ||= resolve(root, ".signal-data");
process.env.PORT ||= "3000";
process.env.HOSTNAME ||= "0.0.0.0";

const staticSource = resolve(root, ".next", "static");
const staticTarget = resolve(standaloneDirectory, ".next", "static");
if (existsSync(staticSource)) {
  mkdirSync(staticTarget, { recursive: true });
  cpSync(staticSource, staticTarget, { recursive: true, force: true });
}

const publicSource = resolve(root, "public");
const publicTarget = resolve(standaloneDirectory, "public");
if (existsSync(publicSource)) cpSync(publicSource, publicTarget, { recursive: true, force: true });

const child = spawn(process.execPath, [serverPath], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) console.error(`服务器因信号 ${signal} 退出`);
  process.exitCode = code ?? 1;
});
