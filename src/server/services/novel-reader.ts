import { ApiError } from "@/lib/api";
import { systemDb, withUserDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { todayIn } from "@/lib/domain/dates";
import { syncFeatureTaskCompletion } from "@/server/services/tasks";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

export interface ChapterChunk {
  chapterNumber: number;
  title: string;
  content: string;
}

export interface HalfChapter {
  chapterNumber: number;
  totalChapters: number;
  half: 1 | 2;
  title: string;
  content: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface QuizGenerationResult {
  questions: QuizQuestion[];
  token: string;
  chapter: number;
  half: 1 | 2;
}

export interface QuizQuestionResult {
  questionIndex: number;
  userAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizSubmissionResult {
  score: number;
  total: 5;
  passed: boolean;
  explanations: string[];
  nextChapter?: number;
  nextHalf?: 1 | 2;
  isNovelCompleted: boolean;
  results: QuizQuestionResult[];
}

const memoryTextCache = new Map<string, string>();

export function stripGutenbergBoilerplate(rawText: string): string {
  let text = rawText;
  const startRegex = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  const startMatch = text.match(startRegex);
  if (startMatch && startMatch.index !== undefined) {
    text = text.slice(startMatch.index + startMatch[0].length);
  }

  const endRegex = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;
  const endMatch = text.match(endRegex);
  if (endMatch && endMatch.index !== undefined) {
    text = text.slice(0, endMatch.index);
  }

  // Strip Standard Ebooks / public domain / colophon front-matter boilerplate
  const boilerplateMarkers = [
    /The source text and artwork in this ebook are believed to be in the United States public domain[\s\S]*?(?:end of this ebook\.?|CC0 1\.0 Universal[^\n]*)/gi,
    /CC0 1\.0 Universal Public Domain Dedication[^\n]*/gi,
    /Standard Ebooks is a volunteer-driven project[\s\S]*?(?:standardebooks\.org)/gi,
    /transcription from Project Gutenberg and on digital scans from the Internet Archive\.?/gi,
    /For full license information, see the Uncopyright at the end of this ebook\.?/gi,
    /Produced by [^\n]+/gi,
    /Transcribed from [^\n]+/gi,
  ];

  for (const pattern of boilerplateMarkers) {
    text = text.replace(pattern, "");
  }

  return text.trim();
}

/**
 * Strips HTML, XHTML, EPUB styling, XML declarations, and Project Gutenberg headers/footers.
 * Converts headings and paragraphs into clean, readable book prose.
 */
export function stripBookHtmlAndBoilerplate(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;

  // 1. Detect and strip HTML/XHTML/EPUB markup
  const isHtml = /<html|<\?xml|<!DOCTYPE|<head|<body|<section|<div|<p\b/i.test(text);
  if (isHtml) {
    // Strip scripts and styles
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

    // Strip head, nav, header, footer sections
    text = text.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
    text = text.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
    text = text.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
    text = text.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");

    // Strip Standard Ebooks / EPUB front-matter and back-matter sections
    text = text.replace(
      /<(?:section|div)\b[^>]*(?:id|class|epub:type)=["'][^"']*(?:titlepage|imprint|colophon|uncopyright|copyright|frontmatter|backmatter|toc|table-of-contents|halftitle)[^"']*["'][^>]*>[\s\S]*?<\/(?:section|div)>/gi,
      ""
    );

    // Strip XML processing instructions and doctypes
    text = text.replace(/<\?xml\b[^>]*\?>/gi, "");
    text = text.replace(/<!DOCTYPE\b[^>]*>/gi, "");
    text = text.replace(/<!--[\s\S]*?-->/g, "");

    const BOILERPLATE_HEADINGS = /^(?:title\s*page|imprint|colophon|uncopyright|copyright|table\s*of\s*contents|contents|toc|dedication|acknowledgments?|standard\s*ebooks|project\s*gutenberg|preface|half\s*title)/i;

    // Convert section headings (h1 - h6, legend, caption) to readable chapter markers
    text = text.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_match, content) => {
      const cleanHeading = content.replace(/<[^>]+>/g, "").trim();
      if (!cleanHeading || BOILERPLATE_HEADINGS.test(cleanHeading)) {
        return "\n\n";
      }
      return `\n\nChapter: ${cleanHeading}\n\n`;
    });

    // Paragraph breaks and block-level tags
    text = text.replace(/<\/p>/gi, "\n\n");
    text = text.replace(/<p\b[^>]*>/gi, "\n\n");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<hr\s*\/?>/gi, "\n\n");
    text = text.replace(/<li\b[^>]*>/gi, "\n• ");
    text = text.replace(/<\/(?:div|section|article|blockquote)>/gi, "\n\n");

    // Strip all remaining HTML/XML tags
    text = text.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&(?:apos|#39);/gi, "'")
      .replace(/&(?:mdash|#8212);/gi, "—")
      .replace(/&(?:ndash|#8211);/gi, "–")
      .replace(/&(?:ldquo|rdquo|#8220|#8221);/gi, '"')
      .replace(/&(?:lsquo|rsquo|#8216|#8217);/gi, "'")
      .replace(/&#(\d+);/g, (_m, dec) => {
        const code = Number(dec);
        return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
        const code = parseInt(hex, 16);
        return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
      });
  }

  // 2. Strip Project Gutenberg header and footer boilerplate
  text = stripGutenbergBoilerplate(text);

  // 3. Normalize whitespace and newlines
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n\s*\n+/g, "\n\n");

  // 4. Strip leftover boilerplate paragraphs
  const paragraphs = text.split(/\n\s*\n+/);
  const cleanParagraphs = paragraphs.filter((p) => {
    const trimmed = p.trim();
    if (!trimmed) return false;
    if (/The source text and artwork in this ebook are believed to be in the United States public domain/i.test(trimmed)) return false;
    if (/CC0 1\.0 Universal/i.test(trimmed)) return false;
    if (/Uncopyright at the end of this ebook/i.test(trimmed)) return false;
    if (/Standard Ebooks is a volunteer-driven project/i.test(trimmed)) return false;
    if (/Project Gutenberg Literary Archive Foundation/i.test(trimmed)) return false;
    if (/transcription from Project Gutenberg and on digital scans/i.test(trimmed)) return false;
    return true;
  });
  text = cleanParagraphs.join("\n\n");

  return text.trim();
}

export function splitBookIntoChapters(cleanText: string): ChapterChunk[] {
  const chapterRegex =
    /(?:^|\n)\s*(?:CHAPTER|Chapter|ADVENTURE|Adventure|LETTER|Letter|BOOK|Book|PART|Part|ACT|Act|SCENE|Scene|STORY|Story|PROLOGUE|Prologue|EPILOGUE|Epilogue)\s*[:\s–—.]*([^\n]{1,80})/gi;
  const matches = Array.from(cleanText.matchAll(chapterRegex));

  const BOILERPLATE_TITLES = /^(?:imprint|colophon|uncopyright|titlepage|title\s*page|table\s*of\s*contents|contents|toc|frontmatter|backmatter|dedication|acknowledgments?)/i;

  if (matches.length >= 2) {
    const rawChapters: Array<{ title: string; content: string }> = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index!;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index! : cleanText.length;
      const rawChapter = cleanText.slice(startIndex, endIndex).trim();

      const lines = rawChapter.split("\n");
      const title =
        lines[0]
          .trim()
          .replace(/^Chapter:\s*/i, "")
          .slice(0, 80) || `Chapter ${i + 1}`;
      const content = lines.slice(1).join("\n").trim();

      if (!BOILERPLATE_TITLES.test(title) && content.length > 20) {
        rawChapters.push({ title, content });
      }
    }

    if (rawChapters.length >= 2) {
      return rawChapters.map((ch, idx) => ({
        chapterNumber: idx + 1,
        title: ch.title,
        content: ch.content,
      }));
    }
  }

  // Fallback: chunk by ~2,500 words per chapter
  const paragraphs = cleanText.split(/\n\s*\n+/);
  const chapters: ChapterChunk[] = [];
  let currentParas: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const words = trimmed.split(/\s+/).length;
    currentParas.push(trimmed);
    currentWordCount += words;

    if (currentWordCount >= 2500) {
      chapters.push({
        chapterNumber: chapters.length + 1,
        title: `Chapter ${chapters.length + 1}`,
        content: currentParas.join("\n\n"),
      });
      currentParas = [];
      currentWordCount = 0;
    }
  }

  if (currentParas.length > 0) {
    chapters.push({
      chapterNumber: chapters.length + 1,
      title: `Chapter ${chapters.length + 1}`,
      content: currentParas.join("\n\n"),
    });
  }

  return chapters.length > 0
    ? chapters
    : [{ chapterNumber: 1, title: "Chapter 1", content: cleanText }];
}

export function splitChapterIntoHalves(
  chapter: ChapterChunk,
  totalChapters: number,
  requestedHalf: 1 | 2
): HalfChapter {
  const paragraphs = chapter.content.split(/\n\s*\n+/);
  if (paragraphs.length <= 1) {
    const mid = Math.floor(chapter.content.length / 2);
    const splitPoint = chapter.content.indexOf(". ", mid);
    const cut = splitPoint !== -1 ? splitPoint + 1 : mid;
    const content =
      requestedHalf === 1
        ? chapter.content.slice(0, cut).trim()
        : chapter.content.slice(cut).trim();
    return {
      chapterNumber: chapter.chapterNumber,
      totalChapters,
      half: requestedHalf,
      title: `${chapter.title} (Part ${requestedHalf} of 2)`,
      content: content || chapter.content,
    };
  }

  const totalChars = chapter.content.length;
  let charCount = 0;
  let splitIndex = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    charCount += paragraphs[i].length;
    if (charCount >= totalChars / 2) {
      splitIndex = Math.max(1, i + 1);
      break;
    }
  }

  const half1Paras = paragraphs.slice(0, splitIndex);
  const half2Paras = paragraphs.slice(splitIndex);

  const content =
    (requestedHalf === 1 ? half1Paras : half2Paras).join("\n\n").trim();

  return {
    chapterNumber: chapter.chapterNumber,
    totalChapters,
    half: requestedHalf,
    title: `${chapter.title} (Part ${requestedHalf} of 2)`,
    content: content || chapter.content,
  };
}

export async function fetchNovelFullText(novelId: string): Promise<string> {
  const cached = memoryTextCache.get(novelId);
  // Invalidate any dirty XML/HTML in memoryTextCache
  if (
    cached &&
    !cached.includes("<?xml") &&
    !cached.includes("<!DOCTYPE") &&
    !cached.includes("<style") &&
    !cached.includes("<head")
  ) {
    return cached;
  }

  const novel = await systemDb.novelCatalog.findUnique({
    where: { id: novelId },
  });
  if (!novel) {
    throw new ApiError(404, "NOT_FOUND", "Novel not found");
  }

  let text = "";
  if (novel.externalId) {
    const urlsToTry = [
      `https://www.gutenberg.org/cache/epub/${novel.externalId}/pg${novel.externalId}.txt`,
      `https://www.gutenberg.org/files/${novel.externalId}/${novel.externalId}-0.txt`,
    ];

    for (const u of urlsToTry) {
      try {
        const res = await fetch(u, {
          signal: AbortSignal.timeout(6000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; RoutineTracker/1.0)" },
        });
        if (res.ok) {
          text = await res.text();
          if (text.length > 500) break;
        }
      } catch {
        // try next URL
      }
    }
  }

  if (!text && novel.readUrl) {
    try {
      const res = await fetch(novel.readUrl, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        text = await res.text();
      }
    } catch {
      // fallback
    }
  }

  if (!text || text.length < 200) {
    // Graceful fallback content if remote Gutenberg is unreachable
    text = `Chapter 1: The Opening Journey\n\n${novel.description || "The story unfolds across an engaging world of ideas and timeless adventure."}\n\n` +
      `The road ahead was lined with quiet reflections. Each step revealed a deeper understanding of the path chosen, ` +
      `where each encounter tested resolve and deepened the traveler's perspective. The journey continued with deliberate focus.`;
  }

  const clean = stripBookHtmlAndBoilerplate(text);
  memoryTextCache.set(novelId, clean);
  return clean;
}

export async function getHalfChapterForNovel(
  novelId: string,
  chapterNumber: number,
  half: 1 | 2
): Promise<HalfChapter> {
  const fullText = await fetchNovelFullText(novelId);
  const chapters = splitBookIntoChapters(fullText);
  const targetChapter =
    chapters.find((c) => c.chapterNumber === chapterNumber) ||
    chapters[0] || {
      chapterNumber: 1,
      title: "Chapter 1",
      content: fullText,
    };

  return splitChapterIntoHalves(targetChapter, chapters.length, half);
}

export function buildDeterministicReadingQuiz(halfChapter: HalfChapter): Array<{
  id: string;
  question: string;
  options: string[];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}> {
  const sentences = halfChapter.content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length >= 25 && s.length <= 180 && !s.includes("http") && !s.includes("Gutenberg"));

  return [
    {
      id: "q1",
      question: `What primary premise or narrative scene is established in ${halfChapter.title}?`,
      options: [
        sentences[0] ? `"${sentences[0]}"` : "The scene and character dynamics established in this opening section",
        "An unexpected futuristic sci-fi invention disrupts the setting",
        "A sudden cancellation of the storyline without narrative progression",
        "A commercial advertisement interrupts the narrative sequence",
      ],
      correctIndex: 0,
      explanation: "This section introduces the foundational setting and premise of the chapter.",
    },
    {
      id: "q2",
      question: "Which of the following describes a key observation or event that unfolds in this passage?",
      options: [
        sentences[Math.floor(sentences.length * 0.25)]
          ? `"${sentences[Math.floor(sentences.length * 0.25)]}"`
          : "The characters proceed with their plans through direct dialogue and action",
        "The characters use smartphones to send modern text messages",
        "The story is immediately resolved in a single unrelated paragraph",
        "The narrator falls asleep and dreams of intergalactic travel",
      ],
      correctIndex: 0,
      explanation: "The narrative develops through the characters' observed choices and dialogue.",
    },
    {
      id: "q3",
      question: "What thematic tension or central subject is explored in the middle of this section?",
      options: [
        sentences[Math.floor(sentences.length * 0.5)]
          ? `"${sentences[Math.floor(sentences.length * 0.5)]}"`
          : "The conflict between personal expectations and external circumstances",
        "An abrupt shift into a cooking competition",
        "A technical discussion about modern quantum computing",
        "A debate concerning 21st-century social media algorithms",
      ],
      correctIndex: 0,
      explanation: "The central section explores the key dramatic focus of this portion of the story.",
    },
    {
      id: "q4",
      question: "What notable detail or statement occurs toward the later part of this reading?",
      options: [
        sentences[Math.floor(sentences.length * 0.75)]
          ? `"${sentences[Math.floor(sentences.length * 0.75)]}"`
          : "The characters react to emerging developments and formulate their next response",
        "An alien spacecraft lands and alters the timeline",
        "The narrator explicitly states the story has ended permanently",
        "A random technical formula is inserted into the prose",
      ],
      correctIndex: 0,
      explanation: "This event highlights the escalating momentum leading toward the chapter's continuation.",
    },
    {
      id: "q5",
      question: "What is the key takeaway or state of affairs as this half-chapter draws to a close?",
      options: [
        sentences[sentences.length - 1]
          ? `"${sentences[sentences.length - 1]}"`
          : "The passage concludes with momentum leading directly into the subsequent section",
        "All characters abandon their goals with no resolution or continuation",
        "The text dissolves into random punctuation symbols",
        "The author announces that the remainder of the book is cancelled",
      ],
      correctIndex: 0,
      explanation: "The conclusion of this part sets up the necessary progression for the next part.",
    },
  ];
}

export async function generateNovelQuiz(
  userId: string,
  novelId: string,
  chapterNumber: number,
  half: 1 | 2
): Promise<QuizGenerationResult> {
  const halfChapter = await getHalfChapterForNovel(novelId, chapterNumber, half);
  const textSample = halfChapter.content.slice(0, 4500);

  let rawQuestions: Array<{
    id: string;
    question: string;
    options: string[];
    correctIndex: 0 | 1 | 2 | 3;
    explanation: string;
  }> = [];

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    try {
      const prompt = `You are a Literature Professor and Reading Comprehension Specialist.
Generate exactly 5 multiple-choice reading comprehension questions based ONLY on the provided passage.
The questions must test understanding of key plot events, character motivations, and notable descriptions.

Passage (${halfChapter.title}):
"""
${textSample}
"""

Requirements:
1. Provide exactly 5 questions.
2. Each question must have exactly 4 plausible options (A, B, C, D).
3. Specify the zero-based index of the correct answer (0, 1, 2, or 3).
4. Provide a 1-sentence concise explanation for the correct answer.`;

      const result = await generateText({
        model: google("gemini-3.5-flash-lite"),
        output: Output.object({
          schema: z.object({
            questions: z.array(
              z.object({
                id: z.string(),
                question: z.string().min(10),
                options: z.array(z.string().min(1)).length(4),
                correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
                explanation: z.string().min(5),
              })
            ).length(5),
          }),
        }),
        prompt,
      });

      if (result.output?.questions?.length === 5) {
        rawQuestions = result.output.questions as Array<{
          id: string;
          question: string;
          options: string[];
          correctIndex: 0 | 1 | 2 | 3;
          explanation: string;
        }>;
      }
    } catch (err) {
      console.warn("[Novel Reader] AI quiz generation fallback", err);
    }
  }

  // Deterministic fallback if AI call is unavailable
  if (rawQuestions.length < 5) {
    rawQuestions = buildDeterministicReadingQuiz(halfChapter);
  }

  // Encrypt the answer key into an un-tamperable token
  const answerPayload = JSON.stringify({
    novelId,
    chapter: chapterNumber,
    half,
    answers: rawQuestions.map((q) => q.correctIndex),
    explanations: rawQuestions.map((q) => q.explanation),
    createdAt: Date.now(),
  });
  const token = encryptSecret(answerPayload);

  return {
    chapter: chapterNumber,
    half,
    token,
    questions: rawQuestions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
    })),
  };
}

export async function submitNovelQuiz(
  userId: string,
  userTimezone: string,
  novelId: string,
  token: string,
  userAnswers: number[]
): Promise<QuizSubmissionResult> {
  let decrypted: {
    novelId: string;
    chapter: number;
    half: 1 | 2;
    answers: number[];
    explanations: string[];
    createdAt: number;
  };

  try {
    const raw = decryptSecret(token);
    decrypted = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_TOKEN", "Quiz token is invalid or expired. Please retake the quiz.");
  }

  if (decrypted.novelId !== novelId) {
    throw new ApiError(400, "MISMATCHED_TOKEN", "Quiz token does not match the active novel.");
  }

  const correctAnswers = decrypted.answers;
  let score = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    if (userAnswers[i] === correctAnswers[i]) {
      score++;
    }
  }

  const passed = score >= 3;
  const todayLocalDate = todayIn(userTimezone);

  const fullText = await fetchNovelFullText(novelId);
  const chapters = splitBookIntoChapters(fullText);
  const totalChapters = Math.max(1, chapters.length);

  const isFinalHalfOfFinalChapter = decrypted.chapter >= totalChapters && decrypted.half === 2;
  const isNovelCompleted = passed && isFinalHalfOfFinalChapter;

  let nextChapter = decrypted.chapter;
  let nextHalf: 1 | 2 = decrypted.half;

  if (passed) {
    if (isFinalHalfOfFinalChapter) {
      nextChapter = decrypted.chapter;
      nextHalf = 2;
    } else if (decrypted.half === 1) {
      nextHalf = 2;
    } else {
      nextChapter = decrypted.chapter + 1;
      nextHalf = 1;
    }

    // Advance session in database
    await systemDb.userReadingSession.upsert({
      where: {
        userId_novelId: {
          userId,
          novelId,
        },
      },
      create: {
        userId,
        novelId,
        status: isNovelCompleted ? "COMPLETED" : "READING",
        currentChapter: nextChapter,
        currentHalf: nextHalf,
        lastQuizPassedDate: todayLocalDate,
        lastReadAt: new Date(),
        completedAt: isNovelCompleted ? new Date() : null,
      },
      update: {
        status: isNovelCompleted ? "COMPLETED" : "READING",
        currentChapter: nextChapter,
        currentHalf: nextHalf,
        lastQuizPassedDate: todayLocalDate,
        lastReadAt: new Date(),
        completedAt: isNovelCompleted ? new Date() : null,
      },
    });

    // Auto-complete active NOVEL_READING task in TaskLog!
    await withUserDb(userId, (tx) =>
      syncFeatureTaskCompletion(tx, userId, "NOVEL_READING", todayLocalDate, 1)
    ).catch((err) =>
      console.warn("[Novel Reader] Failed to sync NOVEL_READING task", err)
    );
  }

  return {
    score,
    total: 5,
    passed,
    explanations: decrypted.explanations,
    nextChapter,
    nextHalf,
    isNovelCompleted,
    results: correctAnswers.map((correct, idx) => ({
      questionIndex: idx,
      userAnswer: userAnswers[idx],
      correctAnswer: correct,
      isCorrect: userAnswers[idx] === correct,
      explanation: decrypted.explanations[idx] || "",
    })),
  };
}
