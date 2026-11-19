import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { logHrReply } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const replySchema = z.object({
  note: z.string().optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Job Reply Log API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to record HR reply" } },
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
    const validated = replySchema.parse(json);

    const updated = await logHrReply(user.id, id, validated.note);
    return Response.json({ application: updated }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
