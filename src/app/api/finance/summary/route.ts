import { requireUser } from "@/lib/auth/session";
import { getFinanceSummary } from "@/server/services/finance";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Finance Summary API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to load finance summary" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);

    const summary = await getFinanceSummary(user.id, month);
    return Response.json({ summary }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
