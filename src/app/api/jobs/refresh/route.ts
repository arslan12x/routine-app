import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  COMPANY_CATEGORIES,
  CANDIDATE_EXPERIENCE_LEVELS,
  LOCATION_ELIGIBILITY_FILTERS,
  type CompanyCategory,
  type CandidateExperienceLevel,
  type LocationEligibilityFilter,
} from "@/lib/domain/jobs";
import { refreshAndRotateHiringBatch } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const refreshSchema = z.object({
  categories: z.array(z.enum([...COMPANY_CATEGORIES] as [string, ...string[]])).optional(),
  experienceLevel: z.enum([...CANDIDATE_EXPERIENCE_LEVELS] as [string, ...string[]]).optional(),
  locationFilter: z.enum([...LOCATION_ELIGIBILITY_FILTERS] as [string, ...string[]]).optional(),
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
  console.error("[Job Refresh API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to refresh 2-day hiring batch" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = refreshSchema.parse(json);

    const queued = await refreshAndRotateHiringBatch(
      user.id,
      (validated.categories as CompanyCategory[]) || undefined,
      validated.experienceLevel as CandidateExperienceLevel | undefined,
      validated.locationFilter as LocationEligibilityFilter | undefined
    );

    return Response.json({ applications: queued, refreshed: true }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
