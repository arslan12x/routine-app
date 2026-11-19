import { requireUser } from "@/lib/auth/session";
import { getTaskLearningContext } from "@/server/ai/learning-context";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Task Learning Context] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to load learning context" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: taskId } = await params;
    if (!taskId) {
      throw new ApiError(400, "VALIDATION", "Task ID is required");
    }

    const context = await getTaskLearningContext(user.id, taskId);
    return Response.json(context, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
