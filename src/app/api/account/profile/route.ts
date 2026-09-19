import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { updateUserProfile } from "@/lib/marketplace/social";

const reservedUsernames = new Set(["admin", "api", "account", "developer", "marketplace", "observation", "messages", "u"]);
const schema = z.object({
  name: z.string().trim().min(2).max(50),
  username: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{3,23}$/),
  bio: z.string().trim().max(300).default(""),
  contact: z.string().trim().max(200).default(""),
  websiteUrl: z.union([z.literal(""), z.url().refine((value) => value.startsWith("https://"))]).default(""),
  location: z.string().trim().max(50).default(""),
  contactVisibility: z.enum(["public", "signed_in", "followers", "private"]).default("signed_in"),
  followersVisibility: z.enum(["public", "followers", "private"]).default("public"),
  followingVisibility: z.enum(["public", "followers", "private"]).default("public"),
  favoritesVisibility: z.enum(["public", "private"]).default("private"),
  messagePermission: z.enum(["everyone", "followers", "mutual", "none"]).default("followers"),
});
export async function PATCH(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请检查昵称、用户名、简介和链接格式" }, { status: 400 });
  if (reservedUsernames.has(parsed.data.username)) return Response.json({ error: "该用户名不可使用" }, { status: 400 });
  const duplicate = getMarketplaceDb().prepare("SELECT 1 FROM developers WHERE username = ? COLLATE NOCASE AND id <> ?").get(parsed.data.username, user.id);
  if (duplicate) return Response.json({ error: "该用户名已被使用" }, { status: 409 });
  updateUserProfile(user.id, parsed.data);
  audit("account.profile_updated", "user", user.id, user.id, request);
  return Response.json({ ok: true, username: parsed.data.username });
}
