import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Mql5Compilation } from "./types";

const defaultEditorPath = "C:\\Program Files\\MetaTrader 5\\MetaEditor64.exe";
const editorPath = process.env.MQL5_METAEDITOR_PATH?.trim() || defaultEditorPath;

function extractCount(log: string, kind: "error" | "warning"): number {
  const summary = log.match(new RegExp(`(\\d+)\\s+${kind}s?`, "i"));
  return summary ? Number(summary[1]) : 0;
}

export async function compileMql5(code: string, strategyName: string, signal?: AbortSignal): Promise<Mql5Compilation> {
  if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
  if (process.platform !== "win32" || !existsSync(/* turbopackIgnore: true */ editorPath)) {
    return { status: "unavailable", summary: "当前运行环境未检测到 MetaEditor，未执行编译验证。", errors: 0, warnings: 0, log: "" };
  }

  const workDirectory = join(tmpdir(), "sigma-bot-agent", crypto.randomUUID());
  const sourcePath = join(workDirectory, `${strategyName.replace(/[^a-zA-Z0-9_-]+/g, "_") || "strategy"}.mq5`);
  const logPath = join(workDirectory, "compile.log");
  await mkdir(workDirectory, { recursive: true });
  await writeFile(sourcePath, code, "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const child = spawn(/* turbopackIgnore: true */ editorPath, [`/compile:${sourcePath}`, `/log:${logPath}`], { windowsHide: true, stdio: "ignore" });
      const abort = () => {
        child.kill();
        finish(() => reject(new DOMException("请求已取消", "AbortError")));
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new Error("MetaEditor 编译超时（60 秒）")));
      }, 60_000);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.once("error", (error) => finish(() => reject(error)));
      child.once("exit", () => {
        signal?.removeEventListener("abort", abort);
        finish(resolve);
      });
    });

    const log = await readFile(logPath, "utf8").catch(() => "未找到 MetaEditor 编译日志。");
    const errors = extractCount(log, "error");
    const warnings = extractCount(log, "warning");
    const passed = errors === 0 && !log.includes("未找到 MetaEditor 编译日志");
    return {
      status: passed ? "passed" : "failed",
      summary: passed ? `MetaEditor 编译通过${warnings ? `，${warnings} 个警告` : ""}。` : `MetaEditor 编译失败：${errors} 个错误${warnings ? `，${warnings} 个警告` : ""}。`,
      errors,
      warnings,
      log: log.slice(-20_000),
    };
  } catch (error) {
    return { status: "failed", summary: error instanceof Error ? error.message : "无法启动 MetaEditor 编译。", errors: 1, warnings: 0, log: "" };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}