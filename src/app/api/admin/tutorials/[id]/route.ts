import { revalidatePath } from "next/cache";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { deleteTutorial, getManagedTutorial, updateTutorial, validateTutorialForm } from "@/lib/tutorials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Props) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const id = (await params).id;
  if (!getManagedTutorial(id)) return Response.json({ error: "教程不存在" }, { status: 404 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 1_000_000) return Response.json({ error: "教程内容过大" }, { status: 413 });
  const { input, error } = validateTutorialForm(await request.formData().catch(() => new FormData()));
  if (!input) return Response.json({ error }, { status: 400 });
  updateTutorial(id, input);
  audit("admin.tutorial_updated", "tutorial", id, admin!.id, request, { kind: input.kind, status: input.status });
  revalidatePath("/tutorials");
  revalidatePath(`/tutorials/${id}`);
  return Response.json({ tutorial: { id, status: input.status } });
}

export async function DELETE(request: Request, { params }: Props) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const id = (await params).id;
  if (!deleteTutorial(id)) return Response.json({ error: "教程不存在" }, { status: 404 });
  audit("admin.tutorial_deleted", "tutorial", id, admin!.id, request);
  revalidatePath("/tutorials");
  return Response.json({ ok: true });
}
