import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setBudget } from "@/server/services/finance";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const budgetSchema = z.object({
  category: z.string().trim().min(1).max(100),
  monthlyLimit: z.number().min(0),
  currency: z.string().trim().max(10).optional(),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/, "Invalid monthYear format (YYYY-MM)"),
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
  console.error("[Finance Budget Setting API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to set budget" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = budgetSchema.parse(json);

    const budget = await setBudget(user.id, validated);
    return Response.json({ budget }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
