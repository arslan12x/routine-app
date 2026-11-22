import { extractText } from "unpdf";
import mammoth from "mammoth";
import { ApiError } from "@/lib/api";

/**
 * Normalizes extracted document text by resolving ligatures, bullet points,
 * and collapsing redundant whitespace while preserving paragraph structure.
 */
export function cleanDocumentText(raw: string): string {
  if (!raw) return "";

  return raw
    // Normalize ligatures
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    // Normalize curly quotes & dashes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, " - ")
    .replace(/[\u2022\u00B7\u25CF\u25AA]/g, "\n- ")
    // Normalize newlines & carriage returns
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Replace non-breaking spaces with standard space
    .replace(/\u00A0/g, " ")
    // Collapse multiple horizontal spaces
    .replace(/[ \t]+/g, " ")
    // Collapse excessive blank lines
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Validates that the extracted text contains meaningful readable text
 * and is not binary garbage or unreadable scrambled characters.
 */
export function validateReadableText(text: string, filename: string): void {
  if (!text || text.trim().length < 40) {
    throw new ApiError(
      400,
      "UNREADABLE_RESUME",
      `Could not extract readable text from "${filename}". Please upload a text-based PDF, DOCX, or TXT resume.`
    );
  }

  // Count printable ASCII + common Unicode characters vs unprintable/control bytes
  let printableCount = 0;
  let unprintableCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Standard printable characters, newlines, tabs, and common Latin/Unicode
    if (
      (code >= 32 && code <= 126) ||
      code === 10 ||
      code === 13 ||
      code === 9 ||
      code >= 160
    ) {
      printableCount++;
    } else {
      unprintableCount++;
    }
  }

  const total = printableCount + unprintableCount;
  if (total > 0 && unprintableCount / total > 0.15) {
    throw new ApiError(
      400,
      "BINARY_STREAM_DETECTED",
      `The file "${filename}" appears to be encrypted, corrupt, or contains binary streams instead of clean text.`
    );
  }
}

/**
 * High-reliability serverless-safe resume text extraction engine.
 * Supports PDF (via unpdf/pdfjs), DOCX (via mammoth), and plain text.
 */
export async function extractResumeText(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string> {
  const lowerName = filename.toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();

  let rawExtracted = "";

  try {
    // 1. Plain text / Markdown
    if (
      lowerMime.includes("text") ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md")
    ) {
      rawExtracted = buffer.toString("utf-8");
    }
    // 2. PDF Document
    else if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) {
      const uint8 = new Uint8Array(buffer);
      const { text } = await extractText(uint8, { mergePages: true });
      if (Array.isArray(text)) {
        rawExtracted = text.join("\n\n");
      } else if (typeof text === "string") {
        rawExtracted = text;
      }
    }
    // 3. Word Document (.docx)
    else if (
      lowerMime.includes("wordprocessingml") ||
      lowerName.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      rawExtracted = result.value || "";
    }
    // 4. Legacy .doc or other formats
    else if (lowerName.endsWith(".doc") || lowerMime.includes("msword")) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawExtracted = result.value || "";
      } catch {
        // Fallback to utf-8 text if it happens to be RTF or plain text
        rawExtracted = buffer.toString("utf-8");
      }
    } else {
      // Default fallback
      rawExtracted = buffer.toString("utf-8");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error(`[Resume Parser] Failed to parse document ${filename}:`, error);
    throw new ApiError(
      400,
      "PARSE_FAILED",
      `Failed to parse "${filename}". Please make sure the file is not password-protected and is a standard PDF or DOCX file.`
    );
  }

  const cleaned = cleanDocumentText(rawExtracted);
  validateReadableText(cleaned, filename);

  return cleaned;
}
