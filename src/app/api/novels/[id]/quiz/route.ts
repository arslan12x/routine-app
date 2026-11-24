import { route, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { generateNovelQuiz } from "@/server/services/novel-reader";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  chapter: z.number().int().min(1).optional(),
  half: z.union([z.literal(1), z.literal(2)]).optional(),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();

  let bodyData: { chapter?: number; half?: 1 | 2 } = {};
  try {
    const json = await req.json();
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
  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    throw new ApiError(502, "QUIZ_GENERATION_FAILED", "Could not generate comprehension quiz for this section.");
  }

  return quiz;
});
