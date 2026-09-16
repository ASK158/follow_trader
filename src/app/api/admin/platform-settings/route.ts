import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { updatePlatformSettings } from "@/lib/platform-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const optionalHttpUrl = z.string().trim().max(500).refine((value) => !value || isHttpUrl(value), "请输入以 http:// 或 https:// 开头的有效链接");

const schema = z.object({
  agentFreeUsageLimit: z.number().int().min(0).max(100),
  agentChatCost: z.number().min(0).max(100),
  agentModifyCost: z.number().min(0).max(100),
  agentGenerateCost: z.number().min(0).max(100),
  agentMinimumGasToStart: z.number().min(1).max(100),
  registrationIpDailyLimit: z.number().int().min(1).max(100),
  registrationDevice30dLimit: z.number().int().min(1).max(100),
  registrationRiskThreshold: z.number().int().min(1).max(100),
  telegramUrl: optionalHttpUrl,
  wechatOfficialAccountUrl: optionalHttpUrl,
  youtubeUrl: optionalHttpUrl,
  bilibiliUrl: optionalHttpUrl,
}).superRefine((settings, context) => {
  const maximumCost = Math.max(settings.agentChatCost, settings.agentModifyCost, settings.agentGenerateCost);
  if (settings.agentMinimumGasToStart < maximumCost) {
    context.addIssue({ code: "custom", path: ["agentMinimumGasToStart"], message: "最低预授权余额不能低于最高单次价格" });
  }
});

export async function PUT(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const actor = await getCurrentUser();
  if (!isAdmin(actor)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const rate = consumeRateLimit("admin-platform-settings", `${clientIp(request)}:${actor!.id}`, 30, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "配置修改过于频繁，请稍后重试" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "配置参数不正确" }, { status: 400 });
  const settings = updatePlatformSettings(parsed.data);
  audit("admin.platform_settings_updated", "platform_settings", "agent-and-registration", actor!.id, request, settings);
  return Response.json({ ok: true, settings });
}
