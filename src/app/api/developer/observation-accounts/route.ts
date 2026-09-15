import { revalidatePath } from "next/cache";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { createObservationAccount, validateObservationForm } from "@/lib/observation-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!user.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 300_000) return Response.json({ error: "提交内容过大" }, { status: 413 });
  const { input, error } = validateObservationForm(await request.formData().catch(() => new FormData()));
  if (!input) return Response.json({ error }, { status: 400 });
  const account = createObservationAccount(user.id, input);
  audit("observation.created", "observation_account", account.id, user.id, request, { platform: account.platform, accountType: account.accountType });
  revalidatePath("/observation");
  revalidatePath("/developer");
  return Response.json({ account: { id: account.id } }, { status: 201 });
}