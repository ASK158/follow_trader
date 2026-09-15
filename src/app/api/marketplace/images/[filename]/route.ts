import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { getMarketplaceStorageDirectory } from "@/lib/marketplace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

type Props = { params: Promise<{ filename: string }> };

/** 商品介绍插图：公开只读访问 */
export async function GET(_request: Request, { params }: Props) {
  const filename = (await params).filename;
  // 防止路径穿越
  if (!/^[\w.-]+$/.test(filename)) {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }
  const path = normalize(join(getMarketplaceStorageDirectory(), "images", filename));
  const contentType = CONTENT_TYPES[extname(filename).toLowerCase()];
  if (!contentType || !existsSync(path)) {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(statSync(path).size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
