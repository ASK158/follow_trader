import { z } from "zod";
import { fetch } from "undici";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getAdminAgentModelConfig, getAgentModelConfig, updateAgentModelConfig } from "@/lib/agent/model-config";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  apiKey: z.string().trim().max(500).optional(),
  endpoint: z.url().max(500).refine((value) => new URL(value).protocol === "https:", "API 地址必须使用 HTTPS"),
  model: z.string().trim().min(1).max(120),
});

async function verifyConfig(config: { apiKey: string; endpoint: string; model: string }): Promise<void> {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: "Reply only OK" }],
      stream: false,
      max_tokens: 4,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`AI 服务验证失败（HTTP ${response.status}）`);
}

export async function PUT(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const actor = await getCurrentUser();
  if (!isAdmin(actor)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const rate = consumeRateLimit("admin-agent-model-config", `${clientIp(request)}:${actor!.id}`, 10, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "AI 配置修改过于频繁，请稍后重试" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "配置参数不正确" }, { status: 400 });

  try {
    const apiKey = parsed.data.apiKey || getAgentModelConfig().apiKey;
    await verifyConfig({
      apiKey,
      endpoint: parsed.data.endpoint,
      model: parsed.data.model,
    });
    const config = updateAgentModelConfig(parsed.data);
    audit("admin.agent_model_config_updated", "platform_settings", "agent-model", actor!.id, request, {
      endpoint: config.endpoint,
      model: config.model,
      apiKeyChanged: Boolean(parsed.data.apiKey),
    });
    return Response.json({ ok: true, config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服务验证失败";
    return Response.json({ error: message.includes("API") ? message : "AI 服务连接失败，请检查地址、模型和密钥" }, { status: 400 });
  }
}

export async function GET() {
  const actor = await getCurrentUser();
  if (!isAdmin(actor)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  return Response.json({ config: getAdminAgentModelConfig() });
}
