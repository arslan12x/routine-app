"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Lock,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import type { HalfChapter, QuizGenerationResult, QuizQuestion, QuizSubmissionResult } from "@/server/services/novel-reader";

interface NovelHeaderInfo {
  id: string;
  title: string;
  author: string | null;
  genre: string | null;
  coverUrl: string | null;
}

interface ReadingSessionInfo {
  currentChapter: number;
  currentHalf: number;
  lastQuizPassedDate: string | null;
  passedToday: boolean;
}

type ReadingTheme = "light" | "sepia" | "dark";
type FontSize = "sm" | "base" | "lg" | "xl";

export default function NovelReaderScreen({
  novel,
  initialSession,
  initialHalfChapter,
  lockedActiveNovel,
}: {
  novel: NovelHeaderInfo;
  initialSession: ReadingSessionInfo;
  initialHalfChapter: HalfChapter;
  lockedActiveNovel?: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const [lockedNovel, setLockedNovel] = useState<{ id: string; title: string } | null>(
    lockedActiveNovel || null
  );
  const [session, setSession] = useState<ReadingSessionInfo>(initialSession);
  const [halfChapter, setHalfChapter] = useState<HalfChapter>(initialHalfChapter);
  const [theme, setTheme] = useState<ReadingTheme>("sepia");
  const [fontSize, setFontSize] = useState<FontSize>("base");
  const [loadingChapter, setLoadingChapter] = useState(false);

  // Quiz state
  const [quizOpen, setQuizOpen] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizData, setQuizData] = useState<QuizGenerationResult | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(null);

  async function loadHalfChapter(chapterNum: number, half: 1 | 2) {
    setLoadingChapter(true);
    try {
      const res = await api<{
        novel: NovelHeaderInfo;
        session: ReadingSessionInfo;
        halfChapter: HalfChapter;
      }>(`/api/novels/${novel.id}/read?chapter=${chapterNum}&half=${half}`);

      setHalfChapter(res.halfChapter);
      setSession(res.session);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "details" in err) {
        const details = (err as { details?: { activeNovelId?: string; activeNovelTitle?: string } }).details;
        if (details?.activeNovelId && details?.activeNovelTitle) {
          setLockedNovel({ id: details.activeNovelId, title: details.activeNovelTitle });
          return;
        }
      }
      toast.error("Could not load chapter content. Please retry.");
    } finally {
      setLoadingChapter(false);
    }
  }

  async function startQuiz() {
    setGeneratingQuiz(true);
    setQuizResult(null);
    setAnswers([]);
    setQuizOpen(true);
    try {
      const res = await api<QuizGenerationResult>(`/api/novels/${novel.id}/quiz`, {
        method: "POST",
        body: JSON.stringify({
          chapter: halfChapter.chapterNumber,
          half: halfChapter.half,
        }),
      });
      setQuizData(res);
      setAnswers(new Array(res.questions.length).fill(-1));
    } catch {
      toast.error("Could not generate comprehension quiz. Please retry.");
      setQuizOpen(false);
    } finally {
      setGeneratingQuiz(false);
    }
  }

  async function submitQuiz() {
    if (!quizData) return;
    if (answers.some((a) => a === -1)) {
      toast.error("Please answer all 5 questions before submitting.");
      return;
    }

    setSubmittingQuiz(true);
    try {
      const res = await api<QuizSubmissionResult>(`/api/novels/${novel.id}/quiz/submit`, {
        method: "POST",
        body: JSON.stringify({
          token: quizData.token,
          answers,
        }),
      });

      setQuizResult(res);
      if (res.passed) {
        toast.success(`🎉 Passed with ${res.score}/5! Daily Novel Reading task marked complete.`);
        setSession((prev) => ({
          ...prev,
          passedToday: true,
          currentChapter: res.nextChapter ?? prev.currentChapter,
          currentHalf: res.nextHalf ?? prev.currentHalf,
        }));
      } else {
        toast.error(`Scored ${res.score}/5. You need at least 3/5 to pass. Re-read and try again!`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit quiz.");
    } finally {
      setSubmittingQuiz(false);
    }
  }

  function handleSelectOption(qIndex: number, optIndex: number) {
    if (quizResult) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = optIndex;
      return next;
    });
  }

  function handleNextPart() {
    if (halfChapter.half === 1) {
      loadHalfChapter(halfChapter.chapterNumber, 2);
    } else {
      loadHalfChapter(halfChapter.chapterNumber + 1, 1);
    }
  }

  function handlePrevPart() {
    if (halfChapter.half === 2) {
      loadHalfChapter(halfChapter.chapterNumber, 1);
    } else if (halfChapter.chapterNumber > 1) {
      loadHalfChapter(halfChapter.chapterNumber - 1, 2);
    }
  }

  const themeClasses = {
    light: "bg-white text-stone-900 border-stone-200",
    sepia: "bg-[#fbf0d9] text-[#2b2518] border-[#e6d8bc]",
    dark: "bg-stone-900 text-stone-100 border-stone-800",
  }[theme];

  const fontSizeClasses = {
    sm: "text-sm leading-relaxed",
    base: "text-base leading-relaxed sm:text-lg sm:leading-loose",
    lg: "text-lg leading-loose sm:text-xl sm:leading-loose",
    xl: "text-xl leading-loose sm:text-2xl sm:leading-loose",
  }[fontSize];

  if (lockedNovel) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center space-y-4">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Lock size={28} />
        </div>
        <h2 className="text-xl font-bold text-fg">Active Novel In Progress</h2>
        <p className="text-sm text-muted leading-relaxed">
          You are currently reading <strong className="text-fg">&ldquo;{lockedNovel.title}&rdquo;</strong>. To encourage consistent completion, Routine Tracker locks into one active novel at a time. Complete your current novel to unlock other classics.
        </p>
        <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={() => router.push(`/novels/${lockedNovel.id}`)}
            className="w-full sm:w-auto bg-brand text-brandfg hover:bg-brand/90 font-semibold shadow-xs text-xs px-4 h-9"
          >
            <BookOpen size={14} className="mr-1.5" /> Go to Active Novel
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/novels")}
            className="w-full sm:w-auto text-xs h-9"
          >
            Back to Catalog
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen transition-colors duration-200 pb-20", theme === "dark" ? "bg-stone-950" : theme === "sepia" ? "bg-[#f4e8cf]" : "bg-stone-50")}>
      {/* Top Reading Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/90 backdrop-blur-md px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            href="/novels"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Catalog</span>
          </Link>

          <div className="text-center min-w-0 flex-1">
            <h1 className="text-xs sm:text-sm font-bold truncate">{novel.title}</h1>
            <p className="text-[11px] text-muted truncate">
              {halfChapter.title} · Chapter {halfChapter.chapterNumber} of {halfChapter.totalChapters}
            </p>
          </div>

          {/* Typography Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Theme switcher */}
            <div className="flex items-center rounded-lg border border-border bg-soft p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn("px-2 py-0.5 rounded font-medium transition", theme === "light" ? "bg-white text-stone-900 shadow-xs" : "text-muted")}
                title="White paper"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setTheme("sepia")}
                className={cn("px-2 py-0.5 rounded font-medium transition", theme === "sepia" ? "bg-[#fbf0d9] text-[#2b2518] shadow-xs" : "text-muted")}
                title="Sepia warm"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn("px-2 py-0.5 rounded font-medium transition", theme === "dark" ? "bg-stone-800 text-stone-100 shadow-xs" : "text-muted")}
                title="Night dark"
              >
                A
              </button>
            </div>

            {/* Font size switcher */}
            <div className="flex items-center rounded-lg border border-border bg-soft p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFontSize("sm")}
                className={cn("px-1.5 py-0.5 rounded font-medium", fontSize === "sm" && "bg-card shadow-xs")}
                title="Small"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setFontSize("base")}
                className={cn("px-1.5 py-0.5 rounded font-medium", fontSize === "base" && "bg-card shadow-xs")}
                title="Normal"
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => setFontSize("lg")}
                className={cn("px-1.5 py-0.5 rounded font-medium", fontSize === "lg" && "bg-card shadow-xs")}
                title="Large"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Prose Reading Container */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-6">
        <div className={cn("rounded-2xl border p-6 sm:p-10 shadow-sm transition-colors duration-200", themeClasses)}>
          {loadingChapter ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted gap-3">
              <Loader2 size={32} className="animate-spin text-brand" />
              <p className="text-sm font-medium">Loading chapter text...</p>
            </div>
          ) : (
            <article className="space-y-5">
              <header className="border-b border-current/15 pb-4 mb-6">
                <span className="text-xs uppercase tracking-widest opacity-70 font-semibold block mb-1">
                  {novel.author || "Public Domain Classic"}
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">
                  {halfChapter.title}
                </h2>
                <div className="mt-2 flex items-center gap-2 text-xs opacity-75 font-medium">
                  <span>Part {halfChapter.half} of 2</span>
                  <span>•</span>
                  <span>Chapter {halfChapter.chapterNumber} of {halfChapter.totalChapters}</span>
                  {session.passedToday && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✅ Today&apos;s Quiz Passed
                      </span>
                    </>
                  )}
                </div>
              </header>

              {/* Formatted Paragraphs */}
              <div className={cn("font-serif space-y-4 text-justify select-text", fontSizeClasses)}>
                {halfChapter.content
                  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
                  .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
                  .replace(/<\?xml\b[^>]*\?>/gi, "")
                  .replace(/<!DOCTYPE\b[^>]*>/gi, "")
                  .replace(/<[^>]+>/g, "")
                  .split(/\n\s*\n+/)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <p key={i} className="indent-4 sm:indent-6">
                      {para}
                    </p>
                  ))}
              </div>

              {/* Bottom Section: Quiz & Chapter Advancement */}
              <div className="mt-12 pt-8 border-t border-current/15 flex flex-col items-center gap-5 text-center">
                <div className="max-w-md space-y-1.5">
                  <h3 className="font-bold text-base sm:text-lg">
                    Finished Reading Part {halfChapter.half}?
                  </h3>
                  <p className="text-xs opacity-80 leading-relaxed">
                    Complete today&apos;s 5-question comprehension quiz (minimum 3/5 correct) to verify your reading session and advance your streak.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    type="button"
                    onClick={startQuiz}
                    className="flex items-center gap-2 py-2.5 px-6 font-bold shadow-md bg-brand text-brandfg hover:brightness-110"
                  >
                    <Sparkles size={16} />
                    <span>{session.passedToday ? "Retake 5-Question Quiz" : "Take 5-Question AI Quiz (3/5 to pass)"}</span>
                  </Button>
                </div>

                {/* Navigation between halves */}
                <div className="flex items-center justify-between w-full pt-4 border-t border-current/10 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={handlePrevPart}
                    disabled={halfChapter.chapterNumber === 1 && halfChapter.half === 1}
                    className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={16} />
                    <span>Previous Part</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextPart}
                    disabled={halfChapter.chapterNumber === halfChapter.totalChapters && halfChapter.half === 2}
                    className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 disabled:opacity-30 transition"
                  >
                    <span>Next Part</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </article>
          )}
        </div>
      </main>

      {/* 5-Question Quiz Modal */}
      {quizOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle size={20} className="text-brand shrink-0" />
                <div>
                  <h3 className="font-bold text-base leading-tight">Comprehension Quiz (5 Questions)</h3>
                  <p className="text-xs text-muted">Pass with at least 3/5 correct to complete today&apos;s task</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuizOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-soft"
              >
                ✕
              </button>
            </div>

            {generatingQuiz ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted">
                <Loader2 size={32} className="animate-spin text-brand" />
                <p className="text-sm font-medium">Generating questions from this chapter...</p>
              </div>
            ) : quizData ? (
              <div className="space-y-6">
                {quizData.questions.map((q, qIdx) => (
                  <div key={q.id} className="space-y-2.5 rounded-xl border border-border/70 p-4 bg-soft/30">
                    <p className="text-sm font-bold leading-snug">
                      <span className="text-brand mr-1.5">{qIdx + 1}.</span> {q.question}
                    </p>
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {q.options.map((opt, optIdx) => {
                        const isSelected = answers[qIdx] === optIdx;
                        return (
                          <button
                            type="button"
                            key={optIdx}
                            disabled={Boolean(quizResult)}
                            onClick={() => handleSelectOption(qIdx, optIdx)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs sm:text-sm font-medium transition",
                              isSelected
                                ? "border-brand bg-brand/10 text-brand font-semibold shadow-xs"
                                : "border-border/80 bg-card hover:bg-soft text-foreground"
                            )}
                          >
                            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold", isSelected ? "border-brand bg-brand text-brandfg" : "border-muted/50")}>
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span className="leading-snug">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                    {quizResult && quizResult.explanations[qIdx] && (
                      <p className="text-xs text-muted pt-1 border-t border-border/50">
                        💡 <strong>Explanation:</strong> {quizResult.explanations[qIdx]}
                      </p>
                    )}
                  </div>
                ))}

                {/* Score Banner */}
                {quizResult && (
                  <div className={cn("rounded-xl p-4 border flex items-center gap-3", quizResult.passed ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300")}>
                    {quizResult.passed ? (
                      <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle size={24} className="text-rose-500 shrink-0" />
                    )}
                    <div>
                      <p className="font-bold text-sm">
                        {quizResult.passed ? `Passed! (${quizResult.score}/5 correct)` : `Did not pass (${quizResult.score}/5 correct)`}
                      </p>
                      <p className="text-xs opacity-90">
                        {quizResult.passed
                          ? "Congratulations! Your task has been marked complete and reading progress saved."
                          : "You need 3/5 correct to complete the task. Review the chapter section and retry."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  {quizResult ? (
                    quizResult.passed ? (
                      <Button
                        type="button"
                        onClick={() => {
                          setQuizOpen(false);
                          if (quizResult.nextChapter && quizResult.nextHalf) {
                            loadHalfChapter(quizResult.nextChapter, quizResult.nextHalf);
                          }
                        }}
                        className="py-2 px-5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Continue to Next Part
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={startQuiz}
                        className="py-2 px-5 text-xs font-bold"
                      >
                        Retry Quiz
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      disabled={submittingQuiz || answers.some((a) => a === -1)}
                      onClick={submitQuiz}
                      className="py-2 px-6 text-xs font-bold bg-brand text-brandfg"
                    >
                      {submittingQuiz ? (
                        <>
                          <Loader2 size={14} className="animate-spin mr-1.5" />
                          <span>Grading...</span>
                        </>
                      ) : (
                        <span>Submit Answers</span>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
