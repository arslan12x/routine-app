"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button, inputCls } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import type { TaskView } from "@/server/services/tasks";
import { CATEGORIES, UNITS, WEEKDAY_LABELS } from "./constants";

type Form = Omit<TaskView, "id" | "description"> & { description: string };
const blank: Form = { title: "", description: "", category: "OTHER", isAiGated: false, aiSubject: null, isMandatory: true, completionType: "BOOLEAN", target: 1, unit: "", recurrence: "DAILY", weekdays: [1, 2, 3, 4, 5] };

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
    isMandatory: weekly ? false : f.isMandatory, target: needsTarget ? Number(f.target) : 1,
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
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} htmlFor="t-cat">Category</label>
            <select id="t-cat" className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value as Form["category"])}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          <div><label className={lbl} htmlFor="t-type">Completion</label>
            <select id="t-type" disabled={!!task || f.isAiGated} className={inputCls} value={f.completionType} onChange={(e) => set("completionType", e.target.value as Form["completionType"])}><option value="BOOLEAN">Done / not done</option><option value="MEASURABLE">Measured amount</option></select></div>
        </div>
        <div><label className={lbl} htmlFor="t-rec">Repeats</label>
          <select id="t-rec" disabled={f.isAiGated} className={inputCls} value={f.recurrence} onChange={(e) => set("recurrence", e.target.value as Form["recurrence"])}><option value="DAILY">Every day</option><option value="WEEKDAYS">Selected weekdays</option><option value="WEEKLY_TOTAL">Weekly total (extra only)</option></select></div>
        {f.recurrence === "WEEKDAYS" && (
          <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((l, i) => { const d = i + 1, on = f.weekdays.includes(d); return (
              <button type="button" key={l} aria-pressed={on} onClick={() => set("weekdays", on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort())}
                className={cn("min-h-10 rounded-full border px-3 text-sm", on ? "border-brand bg-brand text-brandfg" : "border-border bg-card")}>{l}</button>); })}
          </div>
        )}
        {needsTarget && (
          <div className="grid grid-cols-2 gap-3">
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
              <select
                id="t-ai-subject"
                required
                className={inputCls}
                value={f.aiSubject ?? ""}
                onChange={(e) => set("aiSubject", e.target.value as NonNullable<Form["aiSubject"]>)}
              >
                <option value="DSA">Data Structures &amp; Algorithms (DSA)</option>
                <option value="FDA">Forward Deployed Engineering (FDA)</option>
                <option value="JAVA">Java</option>
                <option value="SYSTEM_DESIGN">System Design</option>
              </select>
              <p className="mt-1 text-xs text-muted">AI-guided tasks use daily done/not-done completion.</p>
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
