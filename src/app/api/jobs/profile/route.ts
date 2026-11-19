import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getCandidateProfile, saveCandidateProfile } from "@/server/services/jobs";
import { CANDIDATE_EXPERIENCE_LEVELS, type CandidateExperienceLevel } from "@/lib/domain/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const profileSchema = z.object({
  email: z.string().email("Please provide a valid email address").optional(),
  experienceLevel: z.enum([...CANDIDATE_EXPERIENCE_LEVELS] as [string, ...string[]]).optional(),
  experienceYears: z.number().min(0).max(50).optional(),
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
  console.error("[Candidate Profile API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to manage candidate profile" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await getCandidateProfile(user.id);
    return Response.json({ profile }, {
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
    const validated = profileSchema.parse(json);

    const savedProfile = await saveCandidateProfile(user.id, {
      email: validated.email,
      experienceLevel: validated.experienceLevel as CandidateExperienceLevel | undefined,
      experienceYears: validated.experienceYears,
    });

    return Response.json({ profile: savedProfile, email: savedProfile.email, success: true }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
