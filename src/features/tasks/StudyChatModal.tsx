"use client";

import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { AlertTriangle, Send, Sparkles, X } from "lucide-react";
import { Button, inputCls } from "@/components/ui";
import type { DayItem } from "@/server/services/tasks";
import MermaidDiagram from "./MermaidDiagram";
import PomodoroTimer from "./PomodoroTimer";

const subjectLabels = {
  DSA: "Data Structures & Algorithms",
  FDA: "Forward Deployed Engineering",
  JAVA: "Java",
  SYSTEM_DESIGN: "System Design",
  CUSTOM: "Custom study course",
} as const;

interface LearningContextData {
  taskId: string;
  completedDays: number;
  streak: number;
  currentDay: number;
  currentModule: number;
  stage: string;
  badgeLabel: string;
  summary: string;
  hasSkippedDays: boolean;
  missedDaysCount: number;
  missedDates: string[];
  penaltyRequired: boolean;
  penaltyExerciseCount: number;
  penaltyNotice: string | null;
}

function completionOutput(message: UIMessage) {
  for (const part of message.parts) {
    if (part.type !== "tool-mark_complete" || !("output" in part)) continue;
    const output: unknown = part.output;
    if (typeof output === "object" && output !== null && "sessionPassed" in output && output.sessionPassed === true) return output;
  }
  return null;
}

function MarkdownCode({ className, children, ...props }: { className?: string; children?: ReactNode }) {
  return <code className={className} {...props}>{children}</code>;
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  if (
    isValidElement<{ className?: string; children?: ReactNode }>(children)
    && children.props.className?.includes("language-mermaid")
  ) {
    return <MermaidDiagram chart={String(children.props.children ?? "").replace(/\n$/, "")} />;
  }
  return <pre className="my-4 overflow-x-auto rounded-xl bg-[#171717] p-4 text-sm text-neutral-100">{children}</pre>;
}

const markdownComponents = {
  pre: MarkdownPre,
  code: MarkdownCode,
  h1: ({ children }: { children?: ReactNode }) => <h1 className="mb-3 mt-6 text-2xl font-semibold">{children}</h1>,
  h2: ({ children }: { children?: ReactNode }) => <h2 className="mb-2 mt-6 text-xl font-semibold">{children}</h2>,
  h3: ({ children }: { children?: ReactNode }) => <h3 className="mb-2 mt-5 text-lg font-semibold">{children}</h3>,
  p: ({ children }: { children?: ReactNode }) => <p className="my-3 leading-7">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }: { children?: ReactNode }) => <blockquote className="my-4 border-l-2 border-brand pl-4 text-muted">{children}</blockquote>,
  table: ({ children }: { children?: ReactNode }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
  th: ({ children }: { children?: ReactNode }) => <th className="border border-border bg-bg px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => <a className="text-brand underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{children}</a>,
  hr: () => <hr className="my-5 border-border" />,
};

export default function StudyChatModal({
  task,
  onClose,
  onCompleted,
}: {
  task: DayItem;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [input, setInput] = useState("");
  const [didComplete, setDidComplete] = useState(false);
  const [learningBadge, setLearningBadge] = useState<string | null>(null);
  const [learningContext, setLearningContext] = useState<LearningContextData | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const notifiedStudyResults = useRef(new Set<string>());
  const didStartSession = useRef(false);
  const messagesContainer = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/study",
      body: { taskId: task.id },
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (response.ok) return response;

        const payload: unknown = await response.clone().json().catch(() => null);
        const message = typeof payload === "object" && payload !== null
          && "error" in payload && typeof payload.error === "object" && payload.error !== null
          && "message" in payload.error && typeof payload.error.message === "string"
          ? payload.error.message
          : `Study request failed (${response.status}). Please try again.`;
        throw new Error(message);
      },
    }),
    onError: (chatError) => console.error("[AI study] Chat request failed", chatError),
  });
  const busy = status === "submitted" || status === "streaming";
  const courseName = task.aiSubject === "CUSTOM" ? task.aiCourseName : subjectLabels[task.aiSubject ?? "DSA"];

  useEffect(() => {
    let active = true;
    fetch(`/api/tasks/${task.id}/learning-context`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LearningContextData | null) => {
        if (active) {
          if (data) {
            setLearningContext(data);
            if (data.badgeLabel) {
              setLearningBadge(data.badgeLabel);
            }
          }
          setLoadingContext(false);
        }
      })
      .catch((err) => {
        console.warn("[AI study] Failed to load learning context", err);
        if (active) setLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, [task.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingContext(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stop();
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, stop]);

  useEffect(() => {
    if (didStartSession.current || loadingContext) return;
    didStartSession.current = true;
    if (learningContext?.penaltyRequired) {
      void sendMessage({
        text: `I missed ${learningContext.missedDaysCount} scheduled study day(s). Initiate my Consistency Penalty Review Sprint with ${learningContext.penaltyExerciseCount} practice exercises on previous topics before unlocking today's lesson.`,
      });
    } else {
      void sendMessage({
        text: "Start today's study session with a structured lesson and progressive practice set for this course. Guide me through answering the practical exercise.",
      });
    }
  }, [loadingContext, learningContext, sendMessage]);

  useEffect(() => {
    messagesContainer.current?.scrollTo({ top: messagesContainer.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    for (const message of messages) {
      const output = completionOutput(message);
      if (!output) continue;
      if (!notifiedStudyResults.current.has(message.id)) {
        notifiedStudyResults.current.add(message.id);
        onCompleted();
      }
      if (typeof output === "object" && "completed" in output && output.completed === true) {
        setDidComplete(true);
      }
    }
  }, [messages, onCompleted]);

  const closeSession = () => {
    stop();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex h-[100dvh] w-screen flex-col overflow-hidden bg-bg text-fg">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className={`grid size-9 shrink-0 place-items-center rounded-full sm:size-10 ${learningContext?.penaltyRequired ? "bg-amber-500/10 text-amber-500" : "bg-brand/10 text-brand"}`}>
              {learningContext?.penaltyRequired ? <AlertTriangle size={19} aria-hidden /> : <Sparkles size={19} aria-hidden />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="truncate font-semibold">{courseName}</h1>
                {learningContext?.penaltyRequired ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 sm:text-[11px]">
                    <AlertTriangle size={12} aria-hidden />
                    <span>{learningContext.penaltyExerciseCount} Penalty Qs Required</span>
                  </span>
                ) : learningBadge ? (
                  <span className="inline-flex items-center rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand sm:text-[11px]">
                    {learningBadge}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted">Study session · {task.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <PomodoroTimer />
            <Button type="button" variant="outline" className="min-h-9 shrink-0 rounded-full px-2.5 sm:min-h-10 sm:px-3" onClick={closeSession}>
              <span className="hidden sm:inline">End session</span><X size={17} className="sm:hidden" aria-hidden />
              <span className="sr-only sm:hidden">End session</span>
            </Button>
          </div>
        </div>
      </header>

      <main ref={messagesContainer} className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 sm:px-8" aria-live="polite">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col py-6 sm:py-10">
          {learningContext?.penaltyRequired && (
            <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 sm:p-4 text-amber-700 dark:text-amber-300">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
                <AlertTriangle size={16} className="shrink-0 text-amber-500" />
                <span>Consistency Penalty Active · {learningContext.missedDaysCount} Missed Day{learningContext.missedDaysCount > 1 ? "s" : ""}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Inconsistency detected. Today&apos;s new lesson content is locked. Complete <strong>{learningContext.penaltyExerciseCount} review exercises</strong> on previous topics to regain consistency before today&apos;s curriculum is displayed.
              </p>
            </div>
          )}

          {messages.length === 0 && (
            <div className="m-auto max-w-lg text-center">
              <div className={`mx-auto mb-4 grid size-14 place-items-center rounded-full ${learningContext?.penaltyRequired ? "bg-amber-500/10 text-amber-500" : "bg-brand/10 text-brand"}`}>
                {learningContext?.penaltyRequired ? <AlertTriangle size={24} aria-hidden /> : <Sparkles size={24} aria-hidden />}
              </div>
              <h2 className="display text-2xl font-semibold">
                {learningContext?.penaltyRequired ? "Consistency Penalty Active" : "Let’s make progress"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {learningContext?.penaltyRequired
                  ? `You missed ${learningContext.missedDaysCount} scheduled study day${learningContext.missedDaysCount > 1 ? "s" : ""}. Your tutor is preparing a ${learningContext.penaltyExerciseCount}-question review sprint on previous topics before revealing today's lesson.`
                  : `Your tutor is preparing a lesson and a structured set of exercises for ${courseName}.`}
              </p>
            </div>
          )}

          <div className="space-y-8">
            {messages.map((message) => {
              const output = completionOutput(message);
              return (
                <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={message.role === "user"
                    ? "max-w-[90%] rounded-3xl rounded-br-lg bg-brand px-5 py-3 text-brandfg sm:max-w-[80%]"
                    : "w-full max-w-full text-sm sm:text-base"}>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return message.role === "user"
                          ? <p key={`${message.id}-${index}`} className="whitespace-pre-wrap leading-7">{part.text}</p>
                          : <div key={`${message.id}-${index}`} className="study-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{part.text}</ReactMarkdown></div>;
                      }
                      if (
                        output && typeof output === "object" && "message" in output
                        && part.type === "tool-mark_complete" && "output" in part
                      ) {
                        return (
                          <div key={`${message.id}-${index}`} className={`mt-4 rounded-2xl border p-4 text-sm ${"completed" in output && output.completed === true ? "border-ok/30 bg-ok/10 text-ok" : "border-brand/30 bg-brand/5 text-fg"}`}>
                            <p className="font-semibold">{String(output.message)}</p>
                            {"score" in output && <p className="mt-1 text-xs opacity-80">Exercise score: {String(output.score)}/100</p>}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </article>
              );
            })}
          </div>
          {busy && (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted" role="status">
              <span className="size-2 animate-pulse rounded-full bg-brand" />
              Your tutor is thinking…
            </div>
          )}
          {didComplete && <p className="mt-5 text-center text-sm font-medium text-ok">Task complete. Great work!</p>}
          <div className="h-5 shrink-0" />
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pt-4">
        <div className="mx-auto max-w-3xl">
          {error && <p role="alert" className="mb-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{error.message}</p>}
          <form
            className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 shadow-sm focus-within:border-brand/60"
            onSubmit={(event) => {
              event.preventDefault();
              const text = input.trim();
              if (!text || busy) return;
              setInput("");
              void sendMessage({ text });
            }}
          >
            <label className="sr-only" htmlFor="study-message">Your answer or question</label>
            <textarea
              id="study-message"
              className={`${inputCls} min-h-12 max-h-40 resize-y border-0 bg-transparent py-3 shadow-none focus-visible:outline-none`}
              rows={2}
              maxLength={4_000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                didComplete
                  ? "Session passed — you can end this session."
                  : learningContext?.penaltyRequired
                    ? "Submit your answers for the review questions or ask a question…"
                    : "Ask a question or write your answer…"
              }
              disabled={busy || didComplete}
            />
            <Button type="submit" className="size-11 min-h-11 shrink-0 rounded-full px-0" disabled={busy || !input.trim() || didComplete} aria-label="Send message">
              <Send size={17} aria-hidden />
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted">
            {learningContext?.penaltyRequired
              ? "Today's new lesson unlocks once your answers to all penalty review questions pass evaluation."
              : "Your progress updates after your tutor evaluates a passing practical exercise."}
          </p>
        </div>
      </footer>
    </div>
  );
}
