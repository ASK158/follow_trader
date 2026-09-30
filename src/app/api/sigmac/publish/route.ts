import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteSignal, ingestSnapshot, maskLogin } from "@/lib/sigmac/relay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 单份快照最大允许 256 KB，远大于正常持仓数据，超出直接拒绝。 */
const MAX_BODY_BYTES = 262_144;

function authorized(request: Request): boolean {
  const secret = process.env.SIGMAC_PUBLISH_TOKEN;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const tokenDigest = createHash("sha256").update(token).digest();
  const secretDigest = createHash("sha256").update(secret).digest();
  return timingSafeEqual(tokenDigest, secretDigest);
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "未授权" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!process.env.SIGMAC_PUBLISH_TOKEN) {
    return NextResponse.json({ error: "接收端未配置 SIGMAC_PUBLISH_TOKEN" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) return unauthorizedResponse();

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "请求体过大" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "请求体过大" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const result = ingestSnapshot(parsed, Date.now());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { ok: true, signalId: maskLogin(result.login) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** 运维清理：删除指定信号源的当前数据。请求体 { "source_account": 12345678 }。 */
export async function DELETE(request: Request) {
  if (!process.env.SIGMAC_PUBLISH_TOKEN) {
    return NextResponse.json({ error: "接收端未配置 SIGMAC_PUBLISH_TOKEN" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) return unauthorizedResponse();

  let sourceAccount: unknown;
  try {
    sourceAccount = (await request.json())?.source_account;
  } catch {
    sourceAccount = null;
  }
  if (typeof sourceAccount !== "number" || !Number.isInteger(sourceAccount) || sourceAccount <= 0) {
    return NextResponse.json({ error: "source_account 无效" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const removed = deleteSignal(sourceAccount);
  return NextResponse.json({ ok: true, removed }, { headers: { "Cache-Control": "no-store" } });
}
