import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createBlogPlan } from "@/server/services/blogs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const planSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  totalDays: z.number().int().min(1).max(30),
  tone: z.string().trim().min(2).max(100).optional(),
  targetAudience: z.string().trim().min(2).max(100).optional(),
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
  console.error("[Blog Plan API] Creation failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to create blog plan" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = planSchema.parse(json);

    const plan = await createBlogPlan(user.id, validated);
    return Response.json({ plan }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
