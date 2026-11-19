import { requireUser } from "@/lib/auth/session";
import { getJobEmailDraftForApp } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Job Email Draft API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to generate email draft" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const draft = await getJobEmailDraftForApp(user, id);
    return Response.json({ draft }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
