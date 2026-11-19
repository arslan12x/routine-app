import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createExpense } from "@/server/services/finance";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const expenseSchema = z.object({
  amount: z.number().positive(),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  spentAt: z.string().min(1),
  paymentMethod: z.string().trim().max(50).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "VALIDATION", message: error.issues[0]?.message || "Invalid input" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Finance Expense Creation API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to record expense" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = expenseSchema.parse(json);

    const expense = await createExpense(user.id, validated);
    return Response.json({ expense }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
