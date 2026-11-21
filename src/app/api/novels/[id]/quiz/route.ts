import { requireUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { generateNovelQuiz } from "@/server/services/novel-reader";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  chapter: z.number().int().min(1).optional(),
  half: z.union([z.literal(1), z.literal(2)]).optional(),
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
  console.error("[Novel Quiz API] Error", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to generate novel quiz" } },
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

    let bodyData: { chapter?: number; half?: 1 | 2 } = {};
    try {
      const json = await request.json();
      bodyData = bodySchema.parse(json);
    } catch {
      // Body is optional
    }

    const session = await systemDb.userReadingSession.findUnique({
      where: { userId_novelId: { userId: user.id, novelId: id } },
    });

    const chapter = bodyData.chapter || session?.currentChapter || 1;
    const half = (bodyData.half || session?.currentHalf || 1) as 1 | 2;

    const quiz = await generateNovelQuiz(user.id, id, chapter, half);

    return Response.json(quiz, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
