import { requireUser } from "@/lib/auth/session";
import { deleteExpense } from "@/server/services/finance";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Finance Expense Deletion API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to delete expense" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteExpense(user.id, id);
    return Response.json({ ok: true }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
