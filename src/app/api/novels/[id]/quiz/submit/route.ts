import { requireUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";
import { submitNovelQuiz } from "@/server/services/novel-reader";
import { z } from "zod";

export const runtime = "nodejs";

const submitSchema = z.object({
  token: z.string().min(10, "Quiz token is required"),
  answers: z.array(z.number().int().min(0).max(3)).length(5, "Exactly 5 answers required"),
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
  console.error("[Novel Quiz Submit API] Error", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to grade novel quiz" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const json = await request.json();
    const body = submitSchema.parse(json);

    const result = await submitNovelQuiz(
      user.id,
      user.timezone,
      id,
      body.token,
      body.answers
    );

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
