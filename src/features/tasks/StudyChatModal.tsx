"use client";

import { useEffect, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Send } from "lucide-react";
import { Button, inputCls } from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { DayItem } from "@/server/services/tasks";

const subjectLabels = {
  DSA: "Data Structures & Algorithms",
  FDA: "Forward Deployed Engineering",
  JAVA: "Java",
  SYSTEM_DESIGN: "System Design",
} as const;

function completionOutput(message: UIMessage) {
  for (const part of message.parts) {
    if (part.type !== "tool-mark_complete" || !("output" in part)) continue;
    const output: unknown = part.output;
    if (typeof output === "object" && output !== null && "completed" in output && output.completed === true) return output;
  }
  return null;
}

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
  const didNotifyCompletion = useRef(false);
  const didStartSession = useRef(false);
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/study",
      body: { taskId: task.id },
    }),
    onError: (chatError) => console.error("[AI study] Chat request failed", chatError),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (didStartSession.current) return;
    didStartSession.current = true;
    void sendMessage({ text: "Start today's study session with an appropriately challenging exercise for this course. Guide me one step at a time." });
  }, [sendMessage]);

  useEffect(() => {
    if (!didNotifyCompletion.current && messages.some((message) => completionOutput(message))) {
      didNotifyCompletion.current = true;
      setDidComplete(true);
      onCompleted();
    }
  }, [messages, onCompleted]);

  return (
    <Modal title={`Study · ${task.title}`} onClose={() => { stop(); onClose(); }}>
      <div className="mb-3 rounded-xl bg-soft p-3 text-sm">
        <div className="font-medium">{subjectLabels[task.aiSubject ?? "DSA"]}</div>
        <div className="text-xs text-muted">Today's task is completed only after the AI evaluates a successful exercise.</div>
      </div>
      <div className="max-h-[45dvh] space-y-3 overflow-y-auto rounded-xl border border-border p-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-sm text-muted">Start your study session. The mentor will give you an exercise and guide you through it.</p>
        )}
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-8 rounded-xl bg-brand/10 p-3 text-sm" : "mr-5 rounded-xl bg-soft p-3 text-sm"}>
            {message.parts.map((part, index) => {
              if (part.type === "text") return <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">{part.text}</p>;
              const output = completionOutput({ ...message, parts: [part] });
              if (output && typeof output === "object" && "message" in output) {
                return <p key={`${message.id}-${index}`} className="mt-2 font-medium text-ok">{String(output.message)}</p>;
              }
              return null;
            })}
          </div>
        ))}
        {busy && <p className="text-xs text-muted" role="status">Thinking…</p>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{error.message}</p>}
      {didComplete && (
        <p className="mt-3 rounded-xl bg-ok/10 p-3 text-sm font-medium text-ok">Study session passed. Your task is complete.</p>
      )}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text || busy) return;
          setInput("");
          void sendMessage({ text });
        }}
      >
        <label className="sr-only" htmlFor="study-message">Your answer</label>
        <textarea
          id="study-message"
          className={`${inputCls} min-h-11 max-h-32 resize-y py-3`}
          rows={2}
          maxLength={4_000}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your answer or question…"
          disabled={busy || didComplete}
        />
        <Button type="submit" className="size-11 min-h-11 shrink-0 px-0" disabled={busy || !input.trim() || didComplete} aria-label="Send message">
          <Send size={17} aria-hidden />
        </Button>
      </form>
    </Modal>
  );
}
