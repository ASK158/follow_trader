import { revalidatePath } from "next/cache";
import { audit } from "@/lib/auth/security";
import { getNowPaymentsPayment, verifyNowPaymentsSignature } from "@/lib/payments/nowpayments";
import { applyVerifiedPayment, finishWebhookEvent, recordWebhookEvent } from "@/lib/payments/recharges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) return Response.json({ error: "请求体过大" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ error: "请求体过大" }, { status: 413 });
  const payload = (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })();
  const signature = request.headers.get("x-nowpayments-sig");
  if (!payload || !verifyNowPaymentsSignature(payload, signature)) return Response.json({ error: "签名验证失败" }, { status: 401 });
  const event = recordWebhookEvent(payload, signature!);
  if (event.duplicate) return Response.json({ ok: true, duplicate: true });
  try {
    const paymentId = payload && typeof payload === "object" && "payment_id" in payload ? String((payload as { payment_id: unknown }).payment_id) : "";
    if (!paymentId) throw new Error("IPN 缺少 payment_id");
    // 不直接相信回调正文，使用服务端 API Key 重新读取最终支付状态。
    const result = applyVerifiedPayment(await getNowPaymentsPayment(paymentId));
    finishWebhookEvent(event.id);
    audit(result.credited ? "recharge.credited" : "recharge.status_updated", "crypto_recharge", result.rechargeId, null, request, { status: result.status, paymentId });
    revalidatePath("/account/recharge");
    revalidatePath("/admin/finance");
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IPN 处理失败";
    finishWebhookEvent(event.id, message);
    return Response.json({ error: "处理失败" }, { status: 500 });
  }
}