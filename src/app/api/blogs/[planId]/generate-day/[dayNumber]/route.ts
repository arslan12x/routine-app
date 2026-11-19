import { requireUser } from "@/lib/auth/session";
import { generateDayContent } from "@/server/services/blogs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Blog Day Content Generation API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to generate blog day content" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(
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

    const updatedDay = await generateDayContent(user.id, planId, dayNumber);
    return Response.json({ day: updatedDay }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
