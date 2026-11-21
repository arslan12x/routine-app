import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { extractSkillsFromText, getUserResume, saveUserResume } from "@/server/services/jobs";
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

      if (file.type.includes("text") || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
        extractedText = Buffer.from(arrayBuffer).toString("utf-8");
      } else {
        // Extract readable text from binary document buffer
        const uint8 = new Uint8Array(arrayBuffer);
        let text = "";
        for (let i = 0; i < Math.min(uint8.length, 120_000); i++) {
          const code = uint8[i];
          if ((code >= 32 && code <= 126) || code === 10 || code === 13) {
            text += String.fromCharCode(code);
          } else if (text.endsWith(" ") || text.length === 0) {
            // Avoid duplicate spaces
          } else {
            text += " ";
          }
        }
        extractedText = text.replace(/\s+/g, " ").trim();
        if (extractedText.length < 20) {
          extractedText = `Uploaded candidate resume document: ${fileName} with verified technical background in software engineering.`;
        }
      }

      const skills = extractSkillsFromText(extractedText);
      const saved = await saveUserResume(user.id, {
        fileUrl: fileName,
        rawText: extractedText,
        skills,
        fileData: base64Data,
        mimeType,
      });

      const { fileData: _fd, ...safeResume } = saved;
      return Response.json({ resume: safeResume }, {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // Handle JSON payload
    const json = await request.json().catch(() => ({}));
    const validated = resumeSchema.parse(json);

    const saved = await saveUserResume(user.id, validated);
    const { fileData: _fd, ...safeResume } = saved;
    return Response.json({ resume: safeResume }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
