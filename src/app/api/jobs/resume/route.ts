import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getUserResume, saveUserResume } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const resumeSchema = z.object({
  fileUrl: z.string().optional(),
  rawText: z.string().min(10, "Resume text must be at least 10 characters"),
  skills: z.array(z.string()).optional(),
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
  console.error("[Resume API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to process resume" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const resume = await getUserResume(user.id);
    return Response.json({ resume }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = resumeSchema.parse(json);

    const saved = await saveUserResume(user.id, validated);
    return Response.json({ resume: saved }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
