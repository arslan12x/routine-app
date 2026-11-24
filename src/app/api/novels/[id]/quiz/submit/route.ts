import { route, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { submitNovelQuiz } from "@/server/services/novel-reader";
import { z } from "zod";

export const runtime = "nodejs";

const submitSchema = z.object({
  token: z.string().min(10, "Quiz token is required"),
  answers: z.array(z.number().int().min(0).max(3)).length(5, "Exactly 5 answers required"),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const json = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Invalid input");
  }

  const result = await submitNovelQuiz(
    user.id,
    user.timezone,
    id,
    parsed.data.token,
    parsed.data.answers
  );

  return result;
});
