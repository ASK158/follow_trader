import { revalidatePath } from "next/cache";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { createTutorial, validateTutorialForm } from "@/lib/tutorials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 1_000_000) return Response.json({ error: "教程内容过大" }, { status: 413 });
  const { input, error } = validateTutorialForm(await request.formData().catch(() => new FormData()));
  if (!input) return Response.json({ error }, { status: 400 });
  const tutorial = createTutorial(admin!.id, input);
  audit("admin.tutorial_created", "tutorial", tutorial.id, admin!.id, request, { kind: tutorial.kind, status: tutorial.status });
  revalidatePath("/tutorials");
  return Response.json({ tutorial: { id: tutorial.id, status: tutorial.status } }, { status: 201 });
}
