import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { applyToJob } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const applySchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
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
  console.error("[Job Apply API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to apply to job" } },
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
    const json = await request.json().catch(() => ({}));
    const validated = applySchema.parse(json);

    const updated = await applyToJob(user, id, validated.subject, validated.body);
    return Response.json({ application: updated }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
