import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getCheckinStatus, performCheckin } from "@/lib/marketplace/checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ status: getCheckinStatus(user.id) });
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (user.status !== "active") return Response.json({ error: "账户状态异常，无法打卡" }, { status: 403 });
  const rate = consumeRateLimit("account-checkin", `${user.id}:${clientIp(request)}`, 10, 60 * 1000);
  if (rate.limited) return Response.json({ error: "操作过于频繁，请稍后重试" }, { status: 429 });
  const outcome = performCheckin(user.id);
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 409 });
  audit("account.checkin", "checkin_record", outcome.result.record.id, user.id, request, { streakDays: outcome.result.streakDays, rewardAmount: outcome.result.record.rewardAmount });
  return Response.json({ ok: true, result: outcome.result, status: getCheckinStatus(user.id) });
}
