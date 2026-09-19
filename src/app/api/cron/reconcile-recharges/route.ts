import { revalidatePath } from "next/cache";
import { reconcilePendingRecharges } from "@/lib/payments/recharges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "未授权" }, { status: 401 });
  const result = await reconcilePendingRecharges();
  revalidatePath("/account/recharge");
  revalidatePath("/admin/finance");
  return Response.json({ reconciledAt: new Date().toISOString(), ...result }, { status: result.failed ? 207 : 200 });
}