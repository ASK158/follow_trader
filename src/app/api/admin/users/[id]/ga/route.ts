import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { adjustGaBalance } from "@/lib/marketplace/ga";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  operation: z.enum(["grant", "deduct"]),
  amount: z.number().int().positive().max(10_000_000),
  reason: z.string().trim().min(2).max(200),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const actor = await getCurrentUser();
  if (!isAdmin(actor)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const rate = consumeRateLimit("admin-ga-adjustment", `${clientIp(request)}:${actor!.id}`, 60, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "积分操作过于频繁，请稍后重试" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不正确" }, { status: 400 });
  const targetId = (await params).id;
  const result = adjustGaBalance(actor!.id, targetId, parsed.data.operation, parsed.data.amount, parsed.data.reason);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  audit(
    parsed.data.operation === "grant" ? "admin.ga_granted" : "admin.ga_deducted",
    "user",
    targetId,
    actor!.id,
    request,
    { amount: parsed.data.amount, balance: result.balance, reason: parsed.data.reason, transactionId: result.transactionId },
  );
  return Response.json({ ok: true, balance: result.balance, transactionId: result.transactionId });
}