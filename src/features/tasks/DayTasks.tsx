"use client";
import { Check, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { cn, fmtNum } from "@/lib/cn";
import { triggerLightImpact } from "@/lib/haptics";
import type { DayItem, DayView, TaskView } from "@/server/services/tasks";
import { catLabel } from "./constants";

/** Optimistic local update; the server value replaces it right after the request completes (or fails). */
export function applyLocal(d: DayView, id: string, value: number): DayView {
  const upd = (i: DayItem): DayItem => {
    if (i.id !== id) return i;
    const v = i.completionType === "BOOLEAN" ? (value > 0 ? 1 : 0) : value;
    const weekly = i.recurrence === "WEEKLY_TOTAL";
    const weekSum = weekly ? Math.max(0, (i.weekSum ?? 0) - i.value + v) : null;
    const basis = weekly ? weekSum ?? 0 : v;
    return { ...i, value: v, weekSum, done: basis >= i.target, progress: Math.min(1, basis / i.target) };
  };
  const mandatory = d.mandatory.map(upd), extra = d.extra.map(upd);
  const daily = [...mandatory, ...extra].filter((i) => i.recurrence !== "WEEKLY_TOTAL");
  return {
    ...d, mandatory, extra,
    completed: daily.filter((i) => i.done).length,
    progressPct: daily.length ? Math.round((daily.reduce((a, i) => a + i.progress, 0) / daily.length) * 100) : 0,
  };
}

function Row({ item, editable, onProgress, onStudy, onEdit }: {
  item: DayItem;
  editable: boolean;
  onProgress: (i: DayItem, v: number) => void;
  onStudy?: (i: DayItem) => void;
  onEdit?: (t: TaskView) => void;
}) {
  const measurable = item.completionType === "MEASURABLE";
  const weekly = item.recurrence === "WEEKLY_TOTAL";
  const [draft, setDraft] = useState(item.value ? String(item.value) : "");
  useEffect(() => setDraft(item.value ? String(item.value) : ""), [item.value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || Number.isNaN(n) || n < 0) return setDraft(item.value ? String(item.value) : "");
    if (n !== item.value) onProgress(item, n);
  };
  const unit = item.unit ?? "";
  return (
    <Card className={cn("flex items-start gap-3 p-3", item.done && "border-ok/40")}>
      <button
        disabled={!editable || (item.isAiGated && !onStudy)}
        aria-pressed={item.done}
        aria-label={item.isAiGated
          ? `${item.done ? "Review" : "Start"} AI study: ${item.title}`
          : `${item.done ? "Mark incomplete" : "Mark complete"}: ${item.title}`}
        onClick={() => {
          if (item.isAiGated) {
            onStudy?.(item);
            return;
          }
          triggerLightImpact();
          onProgress(item, measurable ? (item.value >= item.target ? 0 : item.target) : item.value > 0 ? 0 : 1);
        }}
        className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2 transition", item.done ? "pop border-ok bg-ok text-white" : "border-border bg-card", !editable && "opacity-50")}
      >
        {item.done && <Check size={20} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("font-medium leading-snug", item.done && "text-muted line-through")}>{item.title}</div>
          {onEdit && <button onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-soft"><Pencil size={15} /></button>}
        </div>
        <div className="text-xs text-muted">
          {catLabel(item.category)}
          {weekly && ` · Week: ${fmtNum(item.weekSum ?? 0)} / ${fmtNum(item.target)} ${unit}`.trimEnd()}
          {item.description && ` · ${item.description}`}
        </div>
        {measurable && (
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full transition-all", item.done ? "bg-ok" : "bg-brand")} style={{ width: `${item.progress * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <input
                inputMode="decimal" disabled={!editable} value={draft} placeholder="0" aria-label={`Progress for ${item.title}`}
                onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-10 w-24 rounded-lg border border-border bg-bg px-2 tabular-nums"
              />
              <span className="text-muted">{weekly ? "today" : `/ ${fmtNum(item.target)} ${unit}`}{!weekly && ` · ${Math.round(item.progress * 100)}%`}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DayTasks({ data, onProgress, onStudy, onEdit }: {
  data: DayView;
  onProgress: (i: DayItem, v: number) => void;
  onStudy?: (i: DayItem) => void;
  onEdit?: (t: TaskView) => void;
}) {
  const section = (title: string, items: DayItem[], hint: string) => (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-lg font-semibold">{title}</h2><span className="text-xs text-muted">{hint}</span></div>
      <div className="space-y-2">
        {items.length ? items.map((i) => <Row key={i.id} item={i} editable={data.editable} onProgress={onProgress} onStudy={onStudy} onEdit={onEdit} />) : <Empty title={`No ${title.toLowerCase()} today`} />}
      </div>
    </section>
  );
  return (
    <>
      {!data.editable && <p className="mt-4 rounded-xl bg-soft p-3 text-sm text-muted">This day is older than 7 days, so it&apos;s read-only.</p>}
      {section("Mandatory", data.mandatory, `${data.mandatory.filter((i) => i.done).length}/${data.mandatory.length} · decides your streak`)}
      {section("Extra", data.extra, "optional")}
    </>
  );
}
