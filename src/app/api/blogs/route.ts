import { requireUser } from "@/lib/auth/session";
import { listBlogPlans } from "@/server/services/blogs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Blogs API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to load blog plans" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const plans = await listBlogPlans(user.id);
    return Response.json({ plans }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
