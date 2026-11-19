import { requireUser } from "@/lib/auth/session";
import { withUserDb } from "@/lib/db";
import { ensureCompanyDirectorySeeded } from "@/server/services/job-scraper";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Companies API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to load companies" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await ensureCompanyDirectorySeeded();

    const url = new URL(request.url);
    const category = url.searchParams.get("category") || undefined;

    const companies = await withUserDb(user.id, (tx) =>
      tx.company.findMany({
        where: { category },
        orderBy: [{ category: "asc" }, { lastRefreshedAt: "desc" }, { name: "asc" }],
      })
    );

    return Response.json({ companies }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
