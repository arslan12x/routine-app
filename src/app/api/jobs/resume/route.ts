import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { extractSkillsFromText, getUserResume, saveUserResume, recalculateUserAtsScores } from "@/server/services/jobs";
import { extractResumeText } from "@/server/services/resume-parser";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const resumeSchema = z.object({
  fileUrl: z.string().optional(),
  rawText: z.string().min(10, "Resume text must be at least 10 characters"),
  skills: z.array(z.string()).optional(),
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
  console.error("[Resume API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to process resume" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const resume = await getUserResume(user.id);
    if (!resume) {
      return Response.json({ resume: null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { fileData: _fd, ...safeResume } = resume;
    return Response.json({ resume: safeResume }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const contentType = request.headers.get("content-type") || "";

    // Handle Document File Upload (PDF, DOC, DOCX, TXT)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        throw new ApiError(400, "MISSING_FILE", "Please select a resume file (.pdf, .doc, .docx, .txt)");
      }

      const fileName = file.name || "Resume.pdf";
      let extractedText = "";

      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      const lowerName = fileName.toLowerCase();
      const mimeType = file.type || (
        lowerName.endsWith(".pdf")
          ? "application/pdf"
          : lowerName.endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : lowerName.endsWith(".doc")
          ? "application/msword"
          : "text/plain"
      );

      const buffer = Buffer.from(arrayBuffer);
      extractedText = await extractResumeText(buffer, fileName, mimeType);

      const skills = extractSkillsFromText(extractedText);
      const saved = await saveUserResume(user.id, {
        fileUrl: fileName,
        rawText: extractedText,
        skills,
        fileData: base64Data,
        mimeType,
      });

      // Recalculate ATS scores for all candidate TO_APPLY jobs against the new resume
      const recalculatedJobsCount = await recalculateUserAtsScores(user.id).catch((err) => {
        console.warn("[Resume API] Recalculate ATS scores failed:", err);
        return 0;
      });

      const { fileData: _fd, ...safeResume } = saved;
      return Response.json(
        {
          resume: safeResume,
          parsedTextLength: extractedText.length,
          skillsCount: skills.length,
          skills,
          recalculatedJobsCount,
        },
        {
          status: 201,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }

    // Handle JSON payload
    const json = await request.json().catch(() => ({}));
    const validated = resumeSchema.parse(json);

    const saved = await saveUserResume(user.id, validated);
    const recalculatedJobsCount = await recalculateUserAtsScores(user.id).catch((err) => {
      console.warn("[Resume API] Recalculate ATS scores failed:", err);
      return 0;
    });
    const { fileData: _fd, ...safeResume } = saved;
    return Response.json(
      {
        resume: safeResume,
        parsedTextLength: validated.rawText.length,
        skillsCount: (safeResume.skillsJson as string[])?.length || 0,
        skills: safeResume.skillsJson,
        recalculatedJobsCount,
      },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
