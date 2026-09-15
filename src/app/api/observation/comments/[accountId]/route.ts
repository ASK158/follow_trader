import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getObservationAccount } from "@/lib/observation-accounts";
import { createObservationComment } from "@/lib/observation-comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ content: z.string().trim().min(2, "评论至少需要 2 个字符").max(1000, "评论不能超过 1000 个字符") });

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录后发表评论" }, { status: 401 });
  if (!user.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const rate = consumeRateLimit("observation-comments", `${clientIp(request)}:${user.id}`, 10, 10 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "评论发布过于频繁，请稍后重试" }, { status: 429 });
  const accountId = (await params).accountId;
  if (!getObservationAccount(accountId)) return Response.json({ error: "观摩账号不存在" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "评论内容不正确" }, { status: 400 });
  const comment = createObservationComment(accountId, user.id, parsed.data.content);
  audit("observation.comment_created", "observation_comment", comment.id, user.id, request, { accountId });
  revalidatePath(`/observation/${accountId}`);
  return Response.json({ comment }, { status: 201 });
}