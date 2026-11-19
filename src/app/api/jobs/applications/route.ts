import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { COMPANY_CATEGORIES, type CompanyCategory } from "@/lib/domain/jobs";
import { listUserApplications, queueApplications } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const queueSchema = z.object({
  categories: z.array(z.enum([...COMPANY_CATEGORIES] as [string, ...string[]])).min(1, "Select at least one category"),
  limit: z.number().int().min(1).max(20).optional(),
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
  console.error("[Job Applications API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to process job applications" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage") || undefined;
    const catParams = url.searchParams.getAll("category") as CompanyCategory[];

    const result = await listUserApplications(user.id, {
      stage,
      categories: catParams.length > 0 ? catParams : undefined,
    });

    return Response.json(result, {
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
    const validated = queueSchema.parse(json);

    const queued = await queueApplications(
      user.id,
      validated.categories as CompanyCategory[],
      validated.limit || 5
    );

    return Response.json({ applications: queued }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
