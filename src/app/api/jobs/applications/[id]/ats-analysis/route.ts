import { requireUser } from "@/lib/auth/session";
import { withUserDb } from "@/lib/db";
import { analyzeJobAtsFit } from "@/server/ai/jobs";
import { calculateAtsMatch } from "@/lib/domain/ats-matcher";
import { getCandidateProfile } from "@/server/services/jobs";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[ATS Analysis API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to generate ATS analysis" } },
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

    const application = await withUserDb(user.id, (tx) =>
      tx.jobApplication.findUnique({
        where: { id },
        include: { company: true },
      })
    );

    if (!application || application.userId !== user.id) {
      throw new ApiError(404, "NOT_FOUND", "Application not found");
    }

    const resume = await withUserDb(user.id, (tx) =>
      tx.userResume.findUnique({ where: { userId: user.id } })
    );

    if (!resume) {
      throw new ApiError(400, "MISSING_RESUME", "Please upload your resume to run deep ATS analysis");
    }

    const profile = await getCandidateProfile(user.id);
    const resumeSkills = (resume.skillsJson as string[]) || [];

    // Run deterministic match as baseline
    const baseline = calculateAtsMatch(
      resume.parsedText,
      resumeSkills,
      application.jobTitle,
      application.jobDescription,
      profile.experienceLevel
    );

    // Run deep Gemini analysis
    const deepAnalysis = await analyzeJobAtsFit({
      resumeText: resume.parsedText,
      skills: resumeSkills,
      jobTitle: application.jobTitle,
      companyName: application.company.name,
      jobDescription: application.jobDescription,
      experienceLevel: profile.experienceLevel,
    });

    const updatedBreakdown = {
      ...baseline,
      score: deepAnalysis.probabilityPercent,
      probabilityLabel:
        deepAnalysis.probabilityPercent >= 75
          ? "High"
          : deepAnalysis.probabilityPercent >= 50
          ? "Moderate"
          : "Stretch",
      deepAnalysis: {
        ...deepAnalysis,
        analyzedAt: new Date().toISOString(),
      },
    };

    // Cache updated score and breakdown on the application
    await withUserDb(user.id, (tx) =>
      tx.jobApplication.update({
        where: { id: application.id },
        data: {
          atsMatchScore: deepAnalysis.probabilityPercent,
          atsBreakdownJson: JSON.stringify(updatedBreakdown),
        },
      })
    );

    return Response.json(
      {
        atsScore: deepAnalysis.probabilityPercent,
        breakdown: updatedBreakdown,
        analysis: deepAnalysis,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
