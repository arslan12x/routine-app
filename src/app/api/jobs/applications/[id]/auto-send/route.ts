import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { toggleAutoSend } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const autoSendSchema = z.object({
  autoSend: z.boolean(),
});

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Job AutoSend Toggle API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to update auto-send preference" } },
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
    const validated = autoSendSchema.parse(json);

    const updated = await toggleAutoSend(user.id, id, validated.autoSend);
    return Response.json({ application: updated }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
