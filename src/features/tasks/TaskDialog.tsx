"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Button, inputCls } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import { notifyModulesChanged } from "@/lib/events";
import { inferPersonalDevType, type EnabledPersonalDevModules } from "@/lib/domain/types";
import type { TaskView } from "@/server/services/tasks";
import { CATEGORIES, UNITS, WEEKDAY_LABELS } from "./constants";

type Form = Omit<TaskView, "id" | "description"> & { description: string };
const blank: Form = {
  title: "",
  description: "",
  category: "OTHER",
  personalDevType: null,
  isAiGated: false,
  aiSubject: null,
  aiCourseName: null,
  aiCoursePrompt: null,
  isMandatory: true,
  completionType: "BOOLEAN",
  target: 1,
  unit: "",
  recurrence: "DAILY",
  weekdays: [1, 2, 3, 4, 5],
};
const selectCls = `${inputCls} appearance-none pr-10 disabled:cursor-not-allowed disabled:opacity-60`;

export const PERSONAL_DEV_MODULES = [
  { value: "NOVEL_READING", label: "📖 Novel Reading (Enables /novels in sidebar)" },
  { value: "JOB_APPLY", label: "💼 Job Applications (Enables /jobs in sidebar)" },
  { value: "DUOLINGO", label: "🦉 Duolingo Practice (Streak verified)" },
  { value: "BLOG_WRITING", label: "✍️ Blog Writing (Enables /blogs in sidebar)" },
  { value: "CUSTOM", label: "🌟 Custom Personal Development" },
] as const;

export default function TaskDialog({ task, onClose, onSaved }: { task: TaskView | null; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(
    task
      ? {
          ...task,
          description: task.description ?? "",
          unit: task.unit ?? "",
          personalDevType: task.personalDevType || inferPersonalDevType(task.title, task.description, task.category),
        }
      : blank
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const weekly = f.recurrence === "WEEKLY_TOTAL";
  const needsTarget = f.completionType === "MEASURABLE" || weekly;
  const canChangeAiGate = !task || !task.isAiGated;

  const handleTitleChange = (val: string) => {
    setF((prev) => {
      const inferred = !prev.personalDevType ? inferPersonalDevType(val, prev.description, prev.category) : null;
      return {
        ...prev,
        title: val,
        ...(inferred ? { personalDevType: inferred } : {}),
      };
    });
  };

  const handleCategoryChange = (cat: Form["category"]) => {
    if (cat === "PERSONAL_DEVELOPMENT") {
      const devType = f.personalDevType || "JOB_APPLY";
      setF((prev) => ({
        ...prev,
        category: cat,
        personalDevType: devType,
        ...(devType === "JOB_APPLY"
          ? {
              completionType: "MEASURABLE",
              target: 10,
              unit: "applications",
              title: prev.title.trim() === "" ? "Apply to 10 Jobs" : prev.title,
            }
          : devType === "DUOLINGO"
          ? {
              completionType: "BOOLEAN",
              target: 1,
              unit: "",
              title: prev.title.trim() === "" ? "Duolingo Practice" : prev.title,
            }
          : devType === "NOVEL_READING"
          ? {
              completionType: "BOOLEAN",
              target: 1,
              unit: "",
              title: prev.title.trim() === "" ? "Read 1/2 Chapter Novel" : prev.title,
            }
          : devType === "BLOG_WRITING"
          ? {
              completionType: "BOOLEAN",
              target: 1,
              unit: "",
              title: prev.title.trim() === "" ? "Write Daily Blog" : prev.title,
            }
          : {}),
      }));
    } else {
      // Retain or infer devType rather than forcibly wiping it
      setF((prev) => ({
        ...prev,
        category: cat,
        personalDevType: prev.personalDevType || inferPersonalDevType(prev.title, prev.description, cat),
      }));
    }
  };

  const handleDevTypeChange = (devType: Form["personalDevType"]) => {
    setF((prev) => ({
      ...prev,
      personalDevType: devType,
      ...(devType === "JOB_APPLY"
        ? {
            completionType: "MEASURABLE",
            target: 10,
            unit: "applications",
            title: prev.title.trim() === "" || prev.title.startsWith("Apply to") || prev.title.startsWith("Duolingo") || prev.title.startsWith("Read 1/2") || prev.title.startsWith("Write Daily") ? "Apply to 10 Jobs" : prev.title,
          }
        : devType === "DUOLINGO"
        ? {
            completionType: "BOOLEAN",
            target: 1,
            unit: "",
            title: prev.title.trim() === "" || prev.title.startsWith("Apply to") || prev.title.startsWith("Duolingo") || prev.title.startsWith("Read 1/2") || prev.title.startsWith("Write Daily") ? "Duolingo Practice" : prev.title,
          }
        : devType === "NOVEL_READING"
        ? {
            completionType: "BOOLEAN",
            target: 1,
            unit: "",
            title: prev.title.trim() === "" || prev.title.startsWith("Apply to") || prev.title.startsWith("Duolingo") || prev.title.startsWith("Read 1/2") || prev.title.startsWith("Write Daily") ? "Read 1/2 Chapter Novel" : prev.title,
          }
        : devType === "BLOG_WRITING"
        ? {
            completionType: "BOOLEAN",
            target: 1,
            unit: "",
            title: prev.title.trim() === "" || prev.title.startsWith("Apply to") || prev.title.startsWith("Duolingo") || prev.title.startsWith("Read 1/2") || prev.title.startsWith("Write Daily") ? "Write Daily Blog" : prev.title,
          }
        : {}),
    }));
  };

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try {
      const res = (await fn()) as { enabledModules?: EnabledPersonalDevModules } | undefined;
      notifyModulesChanged(res?.enabledModules);
      router.refresh();
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const payload = () => {
    const devType = f.personalDevType || inferPersonalDevType(f.title, f.description, f.category);
    return {
      title: f.title, description: f.description || null, category: f.category,
      personalDevType: devType || null,
      isAiGated: f.isAiGated, aiSubject: f.isAiGated ? f.aiSubject : null,
      aiCourseName: f.isAiGated && f.aiSubject === "CUSTOM" ? f.aiCourseName : null,
      aiCoursePrompt: f.isAiGated && f.aiSubject === "CUSTOM" ? f.aiCoursePrompt : null,
      isMandatory: weekly ? false : f.isMandatory, completionType: f.completionType, target: needsTarget ? Number(f.target) : 1,
      unit: needsTarget ? f.unit || null : null, recurrence: f.recurrence, weekdays: f.recurrence === "WEEKDAYS" ? f.weekdays : [],
    };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => task
      ? api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(payload()) })
      : api("/api/tasks", { method: "POST", body: JSON.stringify({ ...payload(), completionType: f.completionType }) }));
  };
  const lbl = "mb-1 block text-xs font-medium text-muted";

  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className={lbl} htmlFor="t-title">Title</label><input id="t-title" required maxLength={80} className={inputCls} value={f.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Read 10 pages" /></div>
        <div><label className={lbl} htmlFor="t-desc">Description (optional)</label><input id="t-desc" maxLength={300} className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={lbl} htmlFor="t-cat">Category</label>
            <div className="relative min-w-0"><select id="t-cat" className={selectCls} value={f.category} onChange={(e) => handleCategoryChange(e.target.value as Form["category"])}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden /></div></div>
          <div><label className={lbl} htmlFor="t-type">Completion</label>
            <div className="relative min-w-0"><select id="t-type" className={selectCls} value={f.completionType} onChange={(e) => set("completionType", e.target.value as Form["completionType"])}><option value="BOOLEAN">Done / not done</option><option value="MEASURABLE">Measured amount</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden /></div></div>
        </div>

        {/* Linked Feature Module section - available across all categories */}
        <div className={cn("rounded-xl border p-3 space-y-2 transition-colors", f.personalDevType ? "border-brand/40 bg-brand/5" : "border-border/80 bg-card/60")}>
          <div className="flex items-center justify-between">
            <label className={lbl} htmlFor="t-pdev">Linked Feature Module (Sidebar)</label>
            {f.personalDevType && (
              <button
                type="button"
                onClick={() => handleDevTypeChange(null)}
                className="text-[11px] text-muted hover:text-fg underline cursor-pointer"
              >
                Clear link
              </button>
            )}
          </div>
          <div className="relative min-w-0">
            <select
              id="t-pdev"
              className={selectCls}
              value={f.personalDevType || ""}
              onChange={(e) => handleDevTypeChange((e.target.value || null) as Form["personalDevType"])}
            >
              <option value="">None (Standard Routine Task)</option>
              {PERSONAL_DEV_MODULES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden />
          </div>
          <p className="text-xs text-muted">
            {f.personalDevType === "NOVEL_READING" && "📖 Unlocks the /novels reading studio in your sidebar and verifies chapter progress with AI quizzes."}
            {f.personalDevType === "JOB_APPLY" && "💼 Unlocks the /jobs candidate outreach engine in your sidebar with 10 jobs/day goal."}
            {f.personalDevType === "DUOLINGO" && "🦉 Unlocks Duolingo sync in settings and verifies your daily lesson streak."}
            {f.personalDevType === "BLOG_WRITING" && "✍️ Unlocks the /blogs writing studio in your sidebar for automated daily drafting."}
            {f.personalDevType === "CUSTOM" && "🌟 Custom personal development task configured to your own target."}
            {!f.personalDevType && "Optionally link this task to unlock specialized features in your navigation sidebar."}
          </p>
        </div>
        <div><label className={lbl} htmlFor="t-rec">Repeats</label>
          <div className="relative min-w-0"><select id="t-rec" className={selectCls} value={f.recurrence} onChange={(e) => set("recurrence", e.target.value as Form["recurrence"])}><option value="DAILY">Every day</option><option value="WEEKDAYS">Selected weekdays</option><option value="WEEKLY_TOTAL">Weekly total (extra only)</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden /></div></div>
        {f.recurrence === "WEEKDAYS" && (
          <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((l, i) => { const d = i + 1, on = f.weekdays.includes(d); return (
              <button type="button" key={l} aria-pressed={on} onClick={() => set("weekdays", on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort())}
                className={cn("min-h-10 rounded-full border px-3 text-sm", on ? "border-brand bg-brand text-brandfg" : "border-border bg-card")}>{l}</button>); })}
          </div>
        )}
        {needsTarget && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={lbl} htmlFor="t-target">{weekly ? "Weekly target" : "Daily target"}</label><input id="t-target" type="number" min="0.01" step="any" required className={inputCls} value={f.target} onChange={(e) => set("target", Number(e.target.value))} />{weekly && f.isAiGated && <p className="mt-1 text-xs text-muted">A passing study session counts as one session toward this weekly target.</p>}</div>
            <div><label className={lbl} htmlFor="t-unit">Unit</label><input id="t-unit" list="units" maxLength={20} className={inputCls} value={f.unit ?? ""} onChange={(e) => set("unit", e.target.value)} placeholder={weekly && f.completionType === "BOOLEAN" ? "days" : "steps"} />
              <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist></div>
          </div>
        )}
        {!weekly && (
          <label className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-card px-3 text-sm">
            <span><b>Mandatory</b><span className="block text-xs text-muted">Must be done for the day to count toward your streak</span></span>
            <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={f.isMandatory} onChange={(e) => set("isMandatory", e.target.checked)} />
          </label>
        )}
        <div className="space-y-3 rounded-xl border border-border p-3">
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span><b>AI-guided study</b><span className="block text-xs text-muted">Require a successful Gemini study session before completing</span></span>
            <input
              type="checkbox"
              className="size-5 accent-[var(--brand)]"
              disabled={!canChangeAiGate}
              checked={f.isAiGated}
              onChange={(e) => {
                const enabled = e.target.checked;
                setF((current) => ({
                  ...current,
                  isAiGated: enabled,
                  aiSubject: enabled ? current.aiSubject ?? "DSA" : null,
                  aiCourseName: enabled && current.aiSubject === "CUSTOM" ? current.aiCourseName : null,
                  aiCoursePrompt: enabled && current.aiSubject === "CUSTOM" ? current.aiCoursePrompt : null,
                  category: enabled ? "LEARNING" : current.category,
                }));
              }}
            />
          </label>
          {!canChangeAiGate && (
            <p className="text-xs text-muted">
              {task?.isAiGated
                ? "AI-guided completion cannot be disabled once enabled."
                : "AI-guided completion is available for daily done/not-done tasks."}
            </p>
          )}
          {f.isAiGated && (
            <div>
              <label className={lbl} htmlFor="t-ai-subject">Course</label>
              <div className="relative min-w-0">
                <select
                  id="t-ai-subject"
                  required
                  className={selectCls}
                  value={f.aiSubject ?? ""}
                  onChange={(e) => {
                    const subject = e.target.value as NonNullable<Form["aiSubject"]>;
                    setF((current) => ({
                      ...current,
                      aiSubject: subject,
                      aiCourseName: subject === "CUSTOM" ? current.aiCourseName : null,
                      aiCoursePrompt: subject === "CUSTOM" ? current.aiCoursePrompt : null,
                    }));
                  }}
                >
                <option value="DSA">Data Structures &amp; Algorithms (DSA)</option>
                <option value="FDA">Forward Deployed Engineering (FDA)</option>
                <option value="JAVA">Java</option>
                <option value="SYSTEM_DESIGN">System Design</option>
                  <option value="CUSTOM">Custom study course</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden />
              </div>
              {f.aiSubject === "CUSTOM" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={lbl} htmlFor="t-ai-course-name">Course name</label>
                    <input id="t-ai-course-name" required maxLength={80} className={inputCls} value={f.aiCourseName ?? ""} onChange={(e) => set("aiCourseName", e.target.value)} placeholder="e.g. Machine Learning Foundations" />
                  </div>
                  <div>
                    <label className={lbl} htmlFor="t-ai-course-prompt">What do you want to learn?</label>
                    <textarea id="t-ai-course-prompt" required maxLength={4_000} rows={4} className={`${inputCls} py-3`} value={f.aiCoursePrompt ?? ""} onChange={(e) => set("aiCoursePrompt", e.target.value)} placeholder="Describe your goals, current level, topics, and any preferred learning approach. The AI will use this to shape your course and daily lessons." />
                    <p className="mt-1 text-xs text-muted">This is a course brief, not system instructions. The AI uses it to tailor a progressive study plan and each daily exercise.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {task && <p className="text-xs text-muted">Changes to schedule, target or Mandatory apply from today. Past days keep their original rules.</p>}
        {err && <p role="alert" className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : task ? "Save changes" : "Create task"}</Button>
        {task && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => confirm("Archive this task? It stops from today, history is kept.") && run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) }))}>Archive</Button>
            <Button type="button" variant="danger" className="flex-1" disabled={busy} onClick={() => confirm("Delete this task permanently? Only possible if it has no history.") && run(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }))}>Delete</Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
