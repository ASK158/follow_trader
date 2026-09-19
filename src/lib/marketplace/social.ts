import { getMarketplaceDb } from "./db";
import type { MessagePermission, ProfileVisibility, RelationVisibility, User } from "./auth";

export type PublicProfile = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  contact: string | null;
  websiteUrl: string;
  location: string;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  productCount: number;
  observationCount: number;
  favoriteCount: number;
  viewCount: number;
  followersVisibility: RelationVisibility;
  followingVisibility: RelationVisibility;
  favoritesVisibility: "public" | "private";
  messagePermission: MessagePermission;
  isFollowing: boolean;
  canMessage: boolean;
};

type ProfileRow = {
  id: string; username: string; name: string; avatar_filename: string | null; bio: string; contact: string;
  website_url: string; location: string; created_at: string; contact_visibility: ProfileVisibility;
  followers_visibility: RelationVisibility; following_visibility: RelationVisibility;
  favorites_visibility: "public" | "private"; message_permission: MessagePermission;
  follower_count: number; following_count: number; product_count: number; observation_count: number;
  favorite_count: number; product_views: number; observation_views: number;
};

function isFollowing(viewerId: string | undefined, targetId: string): boolean {
  if (!viewerId) return false;
  return Boolean(getMarketplaceDb().prepare("SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?").get(viewerId, targetId));
}

function canSeeContact(row: ProfileRow, viewer: User | null, follows: boolean): boolean {
  if (viewer?.id === row.id || row.contact_visibility === "public") return true;
  if (row.contact_visibility === "signed_in") return Boolean(viewer);
  return row.contact_visibility === "followers" && follows;
}

function canStartMessage(row: ProfileRow, viewer: User | null): boolean {
  if (!viewer || viewer.id === row.id || row.message_permission === "none") return false;
  if (row.message_permission === "everyone") return true;
  const viewerFollows = isFollowing(viewer.id, row.id);
  if (row.message_permission === "followers") return viewerFollows;
  return viewerFollows && isFollowing(row.id, viewer.id);
}

export function getPublicProfile(username: string, viewer: User | null = null): PublicProfile | null {
  const row = getMarketplaceDb().prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM user_follows WHERE following_id = d.id) AS follower_count,
      (SELECT COUNT(*) FROM user_follows WHERE follower_id = d.id) AS following_count,
      (SELECT COUNT(*) FROM products WHERE developer_id = d.id AND status = 'approved') AS product_count,
      (SELECT COUNT(*) FROM observation_accounts WHERE owner_id = d.id) AS observation_count,
      (SELECT COUNT(*) FROM product_favorites f JOIN products p ON p.id = f.product_id WHERE p.developer_id = d.id AND p.status = 'approved') AS favorite_count,
      (SELECT COALESCE(SUM(v.views), 0) FROM product_views v JOIN products p ON p.id = v.product_id WHERE p.developer_id = d.id AND p.status = 'approved') AS product_views,
      (SELECT COALESCE(SUM(views), 0) FROM observation_accounts WHERE owner_id = d.id) AS observation_views
    FROM developers d WHERE d.username = ? COLLATE NOCASE AND d.status = 'active'
  `).get(username) as ProfileRow | undefined;
  if (!row) return null;
  const follows = isFollowing(viewer?.id, row.id);
  return {
    id: row.id, username: row.username, name: row.name,
    avatarUrl: row.avatar_filename ? `/api/users/${row.id}/avatar` : null,
    bio: row.bio ?? "", contact: canSeeContact(row, viewer, follows) ? row.contact : null,
    websiteUrl: row.website_url ?? "", location: row.location ?? "", createdAt: row.created_at,
    followerCount: row.follower_count, followingCount: row.following_count, productCount: row.product_count,
    observationCount: row.observation_count, favoriteCount: row.favorite_count,
    viewCount: row.product_views + row.observation_views,
    followersVisibility: row.followers_visibility, followingVisibility: row.following_visibility,
    favoritesVisibility: row.favorites_visibility, messagePermission: row.message_permission,
    isFollowing: follows, canMessage: canStartMessage(row, viewer),
  };
}

export type ProfileUpdate = {
  name: string; username: string; bio: string; contact: string; websiteUrl: string; location: string;
  contactVisibility: ProfileVisibility; followersVisibility: RelationVisibility; followingVisibility: RelationVisibility;
  favoritesVisibility: "public" | "private"; messagePermission: MessagePermission;
};

export function updateUserProfile(userId: string, input: ProfileUpdate): void {
  getMarketplaceDb().prepare(`
    UPDATE developers SET name = ?, username = ?, bio = ?, contact = ?, website_url = ?, location = ?,
      contact_visibility = ?, followers_visibility = ?, following_visibility = ?, favorites_visibility = ?,
      message_permission = ?, updated_at = ? WHERE id = ?
  `).run(input.name, input.username, input.bio, input.contact, input.websiteUrl, input.location,
    input.contactVisibility, input.followersVisibility, input.followingVisibility, input.favoritesVisibility,
    input.messagePermission, new Date().toISOString(), userId);
}

export function setFollowing(followerId: string, followingId: string, following: boolean): void {
  if (followerId === followingId) throw new Error("不能关注自己");
  const db = getMarketplaceDb();
  if (!db.prepare("SELECT 1 FROM developers WHERE id = ? AND status = 'active'").get(followingId)) throw new Error("用户不存在");
  if (following) db.prepare("INSERT OR IGNORE INTO user_follows (follower_id, following_id, created_at) VALUES (?, ?, ?)").run(followerId, followingId, new Date().toISOString());
  else db.prepare("DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?").run(followerId, followingId);
}

export type ProfileListItem = Pick<PublicProfile, "id" | "username" | "name" | "avatarUrl" | "bio">;

export function listRelations(userId: string, kind: "followers" | "following"): ProfileListItem[] {
  const join = kind === "followers" ? "f.follower_id = d.id" : "f.following_id = d.id";
  const where = kind === "followers" ? "f.following_id = ?" : "f.follower_id = ?";
  const rows = getMarketplaceDb().prepare(`SELECT d.id, d.username, d.name, d.avatar_filename, d.bio FROM user_follows f JOIN developers d ON ${join} WHERE ${where} AND d.status = 'active' ORDER BY f.created_at DESC`).all(userId) as Array<{ id: string; username: string; name: string; avatar_filename: string | null; bio: string }>;
  return rows.map((row) => ({ id: row.id, username: row.username, name: row.name, avatarUrl: row.avatar_filename ? `/api/users/${row.id}/avatar` : null, bio: row.bio ?? "" }));
}

export function searchProfiles(query: string, excludeUserId?: string): ProfileListItem[] {
  const normalized = query.trim().slice(0, 50);
  if (!normalized) return [];
  const pattern = `%${normalized.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = getMarketplaceDb().prepare(`
    SELECT id, username, name, avatar_filename, bio FROM developers
    WHERE status = 'active' AND id <> COALESCE(?, '')
      AND (username LIKE ? ESCAPE '\\' COLLATE NOCASE OR name LIKE ? ESCAPE '\\' COLLATE NOCASE)
    ORDER BY CASE WHEN username = ? COLLATE NOCASE THEN 0 ELSE 1 END, name LIMIT 30
  `).all(excludeUserId ?? null, pattern, pattern, normalized) as Array<{ id: string; username: string; name: string; avatar_filename: string | null; bio: string }>;
  return rows.map((row) => ({ id: row.id, username: row.username, name: row.name, avatarUrl: row.avatar_filename ? `/api/users/${row.id}/avatar` : null, bio: row.bio ?? "" }));
}

export function mayViewRelations(profile: PublicProfile, viewer: User | null, kind: "followers" | "following"): boolean {
  if (viewer?.id === profile.id) return true;
  const visibility = kind === "followers" ? profile.followersVisibility : profile.followingVisibility;
  if (visibility === "public") return true;
  return visibility === "followers" && profile.isFollowing;
}
