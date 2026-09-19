import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { createRecharge, listUserRecharges, RechargeAmountError, RECHARGE_MAX_USDT, RECHARGE_MIN_USDT } from "@/lib/payments/recharges";
import { NowPaymentsApiError, NowPaymentsConfigurationError } from "@/lib/payments/nowpayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ amount: z.number().min(RECHARGE_MIN_USDT).max(RECHARGE_MAX_USDT).multipleOf(0.01) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ recharges: listUserRecharges(user.id) });
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!user.emailVerified) return Response.json({ error: "完成邮箱验证后才能充值" }, { status: 403 });
  const rate = consumeRateLimit("crypto-recharge-create", `${clientIp(request)}:${user.id}`, 10, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "创建充值单过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000) return Response.json({ error: "请求体过大" }, { status: 413 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "充值金额必须为 2.00 至 500.00 USDT，最多两位小数" }, { status: 400 });
  try {
    const recharge = await createRecharge(user.id, parsed.data.amount);
    audit("recharge.created", "crypto_recharge", recharge.id, user.id, request, { amount: recharge.amount, asset: "USDT", network: "TRC20" });
    revalidatePath("/account/recharge");
    return Response.json({ recharge }, { status: 201 });
  } catch (error) {
    if (error instanceof RechargeAmountError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof NowPaymentsApiError && error.code === "AMOUNT_MINIMAL_ERROR") {
      return Response.json({ error: "当前通道最低限额有短时波动，请提高充值金额后重试（建议至少 15 USDT）" }, { status: 400 });
    }
    if (error instanceof NowPaymentsConfigurationError) {
      console.error("NOWPayments configuration error:", error.message);
      return Response.json({ error: "充值通道尚未完成配置，请联系管理员" }, { status: 503 });
    }
    if (error instanceof NowPaymentsApiError) {
      console.error("NOWPayments API error:", { status: error.status, code: error.code, message: error.message });
    } else {
      console.error("NOWPayments request failed:", error);
    }
    return Response.json({ error: "充值通道连接失败，请稍后重试" }, { status: 502 });
  }
}