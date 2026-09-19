import { assertSameOrigin, audit, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { setFollowing } from "@/lib/marketplace/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ userId: string }> };

async function update(request: Request, { params }: Props, following: boolean) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { userId } = await params;
  const rate = consumeRateLimit("user-follow", user.id, 60, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  try { setFollowing(user.id, userId, following); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 400 }); }
  const count = (getMarketplaceDb().prepare("SELECT COUNT(*) AS count FROM user_follows WHERE following_id = ?").get(userId) as { count: number }).count;
  audit(following ? "social.followed" : "social.unfollowed", "user", user.id, userId, request);
  return Response.json({ following, followerCount: count });
}

export function PUT(request: Request, props: Props) { return update(request, props, true); }
export function DELETE(request: Request, props: Props) { return update(request, props, false); }
