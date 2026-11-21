import { ApiError } from "@/lib/api";
import { systemDb, withUserDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { todayIn } from "@/lib/domain/dates";
import { syncFeatureTaskCompletion } from "@/server/services/tasks";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
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

export interface QuizSubmissionResult {
  score: number;
  total: 5;
  passed: boolean;
  explanations: string[];
  nextChapter?: number;
  nextHalf?: 1 | 2;
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

  return text.trim();
}

export function splitBookIntoChapters(cleanText: string): ChapterChunk[] {
  const chapterRegex = /(?:^|\n)\s*(?:CHAPTER|Chapter)\s+([0-9]+|[IVXLCDMivxlcdm]+|[A-Za-z]+)(?:[.:\s\n–—]+([^\n]*))?/g;
  const matches = Array.from(cleanText.matchAll(chapterRegex));

  if (matches.length >= 2) {
    const chapters: ChapterChunk[] = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index!;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index! : cleanText.length;
      const rawChapter = cleanText.slice(startIndex, endIndex).trim();

      const lines = rawChapter.split("\n");
      const title = lines[0].trim().slice(0, 80) || `Chapter ${i + 1}`;
      const content = lines.slice(1).join("\n").trim();

      if (content.length > 20) {
        chapters.push({
          chapterNumber: chapters.length + 1,
          title,
          content,
        });
      }
    }
    if (chapters.length >= 2) return chapters;
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
  if (memoryTextCache.has(novelId)) {
    return memoryTextCache.get(novelId)!;
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

  const clean = stripGutenbergBoilerplate(text);
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

export async function generateNovelQuiz(
  userId: string,
  novelId: string,
  chapterNumber: number,
  half: 1 | 2
): Promise<QuizGenerationResult> {
  const halfChapter = await getHalfChapterForNovel(novelId, chapterNumber, half);
  const textSample = halfChapter.content.slice(0, 3500);

  let rawQuestions: Array<{
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
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

      const result = await generateObject({
        model: google("gemini-3.5-flash-lite"),
        schema: z.object({
          questions: z.array(
            z.object({
              id: z.string(),
              question: z.string().min(10),
              options: z.array(z.string().min(1)).length(4),
              correctIndex: z.number().int().min(0).max(3),
              explanation: z.string().min(5),
            })
          ).length(5),
        }),
        prompt,
      });

      if (result.object?.questions?.length === 5) {
        rawQuestions = result.object.questions;
      }
    } catch (err) {
      console.warn("[Novel Reader] AI quiz generation fallback", err);
    }
  }

  // Deterministic fallback if AI call is unavailable
  if (rawQuestions.length < 5) {
    rawQuestions = [
      {
        id: "q1",
        question: `What is the primary setting or central focus presented in ${halfChapter.title}?`,
        options: [
          "The developing events and characters described in the passage",
          "A modern futuristic metropolis with automated technology",
          "An underwater scientific research station",
          "A completely unpopulated desolate desert",
        ],
        correctIndex: 0,
        explanation: "The passage establishes the narrative scene and key character interactions.",
      },
      {
        id: "q2",
        question: "How do the characters navigate the circumstances described in this section?",
        options: [
          "Through dialogue, observation, and personal decision-making",
          "By utilizing contemporary telecommunications",
          "By immediately turning around and abandoning the plot",
          "By consulting a digital database",
        ],
        correctIndex: 0,
        explanation: "Character actions and discussions drive the progression of the scene.",
      },
      {
        id: "q3",
        question: "What mood or narrative tone characterizes this half-chapter?",
        options: [
          "A classical literary atmosphere reflecting the period and style",
          "Humorous parody of modern cinema",
          "Technical manual instructional syntax",
          "Nonsensical nursery rhyme wordplay",
        ],
        correctIndex: 0,
        explanation: "The text embodies classic literary storytelling and prose style.",
      },
      {
        id: "q4",
        question: "What key realization or development occurs by the conclusion of this passage?",
        options: [
          "The foundation is set for the subsequent events of the narrative",
          "The universe spontaneously collapses",
          "A commercial broadcast interrupts the story",
          "The narrator forgets all prior events",
        ],
        correctIndex: 0,
        explanation: "The chapter section concludes with clear narrative momentum into the next portion.",
      },
      {
        id: "q5",
        question: "Which of the following best reflects an attentive reader's takeaway from this text?",
        options: [
          "Attentiveness to character tone and descriptive context clarifies the theme",
          "Ignoring character relationships produces better understanding",
          "The passage contains zero thematic substance",
          "Skipping sentences has no impact on comprehension",
        ],
        correctIndex: 0,
        explanation: "Careful reading highlights the thematic subtleties of the author's work.",
      },
    ];
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

  let nextChapter = decrypted.chapter;
  let nextHalf: 1 | 2 = decrypted.half;

  if (passed) {
    if (decrypted.half === 1) {
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
        currentChapter: nextChapter,
        currentHalf: nextHalf,
        lastQuizPassedDate: todayLocalDate,
        lastReadAt: new Date(),
      },
      update: {
        currentChapter: nextChapter,
        currentHalf: nextHalf,
        lastQuizPassedDate: todayLocalDate,
        lastReadAt: new Date(),
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
  };
}
