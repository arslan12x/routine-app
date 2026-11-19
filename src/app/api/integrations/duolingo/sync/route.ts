import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { syncDuolingo } from "@/server/services/duolingo";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const syncSchema = z.object({
  username: z.string().trim().min(1).max(100).optional(),
  taskId: z.string().trim().min(1).max(100).optional(),
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
  console.error("[Duolingo Sync API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to sync Duolingo progress" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = syncSchema.parse(json);

    const result = await syncDuolingo(user, validated.username, validated.taskId);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
