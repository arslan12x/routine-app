import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateDayMarkdown } from "@/server/services/blogs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const updateSchema = z.object({
  markdownContent: z.string(),
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
  console.error("[Blog Day Update API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to update blog day content" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ planId: string; dayNumber: string }> }
) {
  try {
    const user = await requireUser();
    const { planId, dayNumber: dayStr } = await params;
    const dayNumber = parseInt(dayStr, 10);
    if (isNaN(dayNumber) || dayNumber < 1) {
      throw new ApiError(400, "VALIDATION", "Invalid day number");
    }

    const json = await request.json().catch(() => ({}));
    const validated = updateSchema.parse(json);

    const updatedDay = await updateDayMarkdown(
      user.id,
      planId,
      dayNumber,
      validated.markdownContent
    );

    return Response.json({ day: updatedDay }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
