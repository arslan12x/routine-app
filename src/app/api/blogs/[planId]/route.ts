import { requireUser } from "@/lib/auth/session";
import { getBlogPlan, deleteBlogPlan } from "@/server/services/blogs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Blog Plan Details API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to process blog plan" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireUser();
    const { planId } = await params;
    const plan = await getBlogPlan(user.id, planId);
    return Response.json({ plan }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const user = await requireUser();
    const { planId } = await params;
    await deleteBlogPlan(user.id, planId);
    return Response.json({ ok: true }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
