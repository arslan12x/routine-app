import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDuolingoIntegration, upsertDuolingoIntegration } from "@/server/services/duolingo";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().trim().min(1).max(100),
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
  console.error("[Duolingo Integration API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to manage Duolingo integration" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const integration = await getDuolingoIntegration(user.id);
    return Response.json({ integration }, {
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
    const validated = bodySchema.parse(json);

    const integration = await upsertDuolingoIntegration(user.id, validated.username);
    return Response.json({ integration }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
