import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { getMarketplaceDb, getMarketplaceStorageDirectory } from "@/lib/marketplace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ userId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { userId } = await params;
  const row = getMarketplaceDb().prepare("SELECT avatar_filename FROM developers WHERE id = ? AND status = 'active'").get(userId) as { avatar_filename: string | null } | undefined;
  if (!row?.avatar_filename || basename(row.avatar_filename) !== row.avatar_filename) return new Response(null, { status: 404 });
  const path = join(getMarketplaceStorageDirectory(), "avatars", row.avatar_filename);
  if (!existsSync(path)) return new Response(null, { status: 404 });
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, { headers: { "Content-Type": "image/webp", "Content-Length": String(statSync(path).size), "Cache-Control": "private, no-cache" } });
}
