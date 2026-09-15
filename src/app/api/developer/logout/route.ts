import { destroySession } from "@/lib/marketplace/auth";
import { assertSameOrigin } from "@/lib/auth/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  await destroySession(request);
  return Response.json({ ok: true });
}
