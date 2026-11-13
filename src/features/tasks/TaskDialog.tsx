"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, inputCls } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import type { TaskView } from "@/server/services/tasks";
import { CATEGORIES, UNITS, WEEKDAY_LABELS } from "./constants";

type Form = Omit<TaskView, "id" | "description"> & { description: string };
const blank: Form = { title: "", description: "", category: "OTHER", isAiGated: false, aiSubject: null, aiCourseName: null, aiCoursePrompt: null, isMandatory: true, completionType: "BOOLEAN", target: 1, unit: "", recurrence: "DAILY", weekdays: [1, 2, 3, 4, 5] };
const selectCls = `${inputCls} appearance-none pr-10 disabled:cursor-not-allowed disabled:opacity-60`;

export default function TaskDialog({ task, onClose, onSaved }: { task: TaskView | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(task ? { ...task, description: task.description ?? "", unit: task.unit ?? "" } : blank);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const weekly = f.recurrence === "WEEKLY_TOTAL";
  const needsTarget = f.completionType === "MEASURABLE" || weekly;
  const canChangeAiGate = !task || (!task.isAiGated && task.completionType === "BOOLEAN" && task.recurrence === "DAILY");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); onSaved(); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  const payload = () => ({
    title: f.title, description: f.description || null, category: f.category,
    isAiGated: f.isAiGated, aiSubject: f.isAiGated ? f.aiSubject : null,
    aiCourseName: f.isAiGated && f.aiSubject === "CUSTOM" ? f.aiCourseName : null,
    aiCoursePrompt: f.isAiGated && f.aiSubject === "CUSTOM" ? f.aiCoursePrompt : null,
    isMandatory: weekly ? false : f.isMandatory, completionType: f.completionType, target: needsTarget ? Number(f.target) : 1,
    unit: needsTarget ? f.unit || null : null, recurrence: f.recurrence, weekdays: f.recurrence === "WEEKDAYS" ? f.weekdays : [],
  });
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
        <div><label className={lbl} htmlFor="t-title">Title</label><input id="t-title" required maxLength={80} className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Walk 11,000 steps" /></div>
        <div><label className={lbl} htmlFor="t-desc">Description (optional)</label><input id="t-desc" maxLength={300} className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={lbl} htmlFor="t-cat">Category</label>
            <div className="relative min-w-0"><select id="t-cat" className={selectCls} value={f.category} onChange={(e) => set("category", e.target.value as Form["category"])}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden /></div></div>
          <div><label className={lbl} htmlFor="t-type">Completion</label>
            <div className="relative min-w-0"><select id="t-type" disabled={f.isAiGated} className={selectCls} value={f.completionType} onChange={(e) => set("completionType", e.target.value as Form["completionType"])}><option value="BOOLEAN">Done / not done</option><option value="MEASURABLE">Measured amount</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden /></div></div>
        </div>
        <div><label className={lbl} htmlFor="t-rec">Repeats</label>
          <div className="relative min-w-0"><select id="t-rec" disabled={f.isAiGated} className={selectCls} value={f.recurrence} onChange={(e) => set("recurrence", e.target.value as Form["recurrence"])}><option value="DAILY">Every day</option><option value="WEEKDAYS">Selected weekdays</option><option value="WEEKLY_TOTAL">Weekly total (extra only)</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden /></div></div>
        {f.isAiGated && <p className="-mt-2 text-xs text-muted">AI-guided tasks are fixed to daily done/not-done completion, so these settings are locked.</p>}
        {f.recurrence === "WEEKDAYS" && (
          <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((l, i) => { const d = i + 1, on = f.weekdays.includes(d); return (
              <button type="button" key={l} aria-pressed={on} onClick={() => set("weekdays", on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort())}
                className={cn("min-h-10 rounded-full border px-3 text-sm", on ? "border-brand bg-brand text-brandfg" : "border-border bg-card")}>{l}</button>); })}
          </div>
        )}
        {needsTarget && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={lbl} htmlFor="t-target">{weekly ? "Weekly target" : "Daily target"}</label><input id="t-target" type="number" min="0.01" step="any" required className={inputCls} value={f.target} onChange={(e) => set("target", Number(e.target.value))} /></div>
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
                  completionType: enabled ? "BOOLEAN" : current.completionType,
                  recurrence: enabled ? "DAILY" : current.recurrence,
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
