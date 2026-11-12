"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Skeleton, Stat } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { isoWeekday, monthRange, parse } from "@/lib/domain/dates";
import type { DayInfo } from "@/lib/domain/types";
import { api } from "@/lib/fetcher";
import { useVisibleInterval } from "@/lib/useVisibleInterval";
import DayTasks, { applyLocal } from "@/features/tasks/DayTasks";
import type { DayItem, DayView } from "@/server/services/tasks";

const SYNC_INTERVAL_MS = 5_000;

export interface CalendarData {
  month: string; today: string; weekStartsOn: 1 | 7;
  days: (DayInfo & {
    totalMandatoryTasks: number;
    completedMandatoryTasks: number;
    tasks: { title: string; isCompleted: boolean; isMandatory: boolean }[];
  })[];
  summary: { current: number; longest: number; successDays: number; failedDays: number; completionRate: number | null; monthSuccessDays: number };
}

function look(d: DayInfo): { cls: string; label: string } {
  switch (d.status) {
    case "SUCCESS": return { cls: "bg-ok text-white", label: "all mandatory tasks done" };
    case "FAILED": return d.mandatoryDone > 0
      ? { cls: "bg-warn/25 text-fg border border-warn", label: "partially completed" }
      : { cls: "bg-bad/20 text-bad border border-bad/50", label: "no mandatory tasks done" };
    case "PENDING": return { cls: "border-2 border-dashed border-brand", label: "in progress" };
    case "NEUTRAL": return { cls: "bg-soft text-muted", label: "no mandatory tasks scheduled" };
    default: return { cls: "text-muted/50", label: "upcoming" };
  }
}

const shiftMonth = (m: string, n: number) => {
  const d = parse(`${m}-01`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7);
};

export default function CalendarScreen({ initial }: { initial: CalendarData }) {
  const [cal, setCal] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [day, setDay] = useState<DayView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const writesInFlight = useRef(0);
  const localChanges = useRef(0);

  const loadMonth = useCallback(async (m: string) => {
    setLoading(true);
    try { setCal(await api<CalendarData>(`/api/calendar?month=${m}`)); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, []);
  const loadDay = useCallback(async (d: string) => {
    try { setDay(await api<DayView>(`/api/calendar/${d}`)); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }, []);
  useEffect(() => { if (sel) loadDay(sel); }, [sel, loadDay]);

  const syncVisibleData = useCallback(async () => {
    if (refreshInFlight.current || writesInFlight.current > 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    refreshInFlight.current = true;
    const version = localChanges.current;
    try {
      const [nextMonth, nextDay] = await Promise.all([
        api<CalendarData>(`/api/calendar?month=${cal.month}`),
        sel ? api<DayView>(`/api/calendar/${sel}`) : Promise.resolve(null),
      ]);
      if (version !== localChanges.current) return;
      setCal((current) => JSON.stringify(current) === JSON.stringify(nextMonth) ? current : nextMonth);
      if (nextDay) setDay((current) => current && JSON.stringify(current) === JSON.stringify(nextDay) ? current : nextDay);
    } catch {
      // Keep the current view and retry on the next poll or when the app returns online.
    } finally {
      refreshInFlight.current = false;
    }
  }, [cal.month, sel]);

  useVisibleInterval(syncVisibleData, SYNC_INTERVAL_MS);

  const onProgress = async (item: DayItem, value: number) => {
    if (!day) return;
    const previous = day;
    localChanges.current += 1;
    writesInFlight.current += 1;
    setDay(applyLocal(day, item.id, value));
    let saved = false;
    try {
      await api(`/api/tasks/${item.id}/progress`, { method: "PUT", body: JSON.stringify({ date: day.date, value }) });
      setErr(null);
      saved = true;
    } catch (e) {
      setDay(previous);
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      writesInFlight.current -= 1;
    }
    if (saved) void syncVisibleData();
  };

  const [first] = monthRange(cal.month);
  const offset = (isoWeekday(first) - cal.weekStartsOn + 7) % 7;
  const heads = cal.weekStartsOn === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(first));
  const s = cal.summary;

  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">Calendar</h1>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Current streak" value={`${s.current}d`} />
        <Stat label="Longest streak" value={`${s.longest}d`} />
        <Stat label="Successful days" value={s.successDays} />
        <Stat label="Completion rate" value={pct(s.completionRate)} hint="past mandatory days" />
        <Stat label="This month" value={s.monthSuccessDays} hint="successful days" />
      </div>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <button aria-label="Previous month" onClick={() => loadMonth(shiftMonth(cal.month, -1))} className="grid size-10 place-items-center rounded-full hover:bg-soft"><ChevronLeft size={18} /></button>
          <div className="display text-lg font-semibold">{title}</div>
          <button aria-label="Next month" onClick={() => loadMonth(shiftMonth(cal.month, 1))} className="grid size-10 place-items-center rounded-full hover:bg-soft"><ChevronRight size={18} /></button>
        </div>
        {loading ? <Skeleton className="h-64" /> : (
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {heads.map((h, i) => <div key={i} className="text-xs text-muted">{h}</div>)}
            {Array.from({ length: offset }, (_, i) => <div key={`b${i}`} />)}
            {cal.days.map((d, index) => {
              const l = look(d); const n = Number(d.date.slice(8));
              const percentage = d.totalMandatoryTasks > 0 && d.status !== "FUTURE"
                ? `${Math.round((d.completedMandatoryTasks / d.totalMandatoryTasks) * 100)}%`
                : "–";
              const column = (offset + index) % 7;
              const tooltipPosition = column >= 5 ? "right-0" : "left-0";
              return (
                <div key={d.date} className="group relative min-w-0">
                  <button disabled={d.status === "FUTURE"} onClick={() => setSel(d.date)} aria-pressed={sel === d.date}
                    aria-label={`${n} ${title}: ${percentage} mandatory tasks complete, ${l.label}`}
                    className={cn("grid aspect-square w-full place-items-center rounded-xl text-sm font-medium transition", l.cls, sel === d.date && "ring-2 ring-fg ring-offset-2 ring-offset-card", d.date === cal.today && "underline underline-offset-4")}>
                    <span>{n}</span><span aria-hidden className="text-[10px] leading-none opacity-80">{percentage}</span>
                  </button>
                  <div role="tooltip" className={cn("pointer-events-none absolute top-full z-50 mt-1 hidden w-56 rounded-xl border border-border bg-card p-3 text-left text-xs shadow-lg group-hover:block group-focus-within:block", tooltipPosition)}>
                    <p className="mb-2 font-medium">{n} {title} · {percentage} mandatory complete</p>
                    {d.tasks.length ? (
                      <ul className="space-y-1.5">
                        {d.tasks.map((task, taskIndex) => (
                          <li key={`${task.title}-${taskIndex}`} className="flex items-start gap-2">
                            <span aria-hidden className={task.isCompleted ? "text-ok" : "text-bad"}>{task.isCompleted ? "✓" : "×"}</span>
                            <span className="min-w-0 break-words">{task.title}{task.isMandatory ? " · Mandatory" : ""}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted">No tasks scheduled.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {err && <p role="alert" className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
      {sel && day && (
        <section className="mt-6">
          <h2 className="display text-xl font-semibold">{day.longDate}</h2>
          <p className="text-sm text-muted">{day.completed} of {day.total} tasks done · {day.progressPct}% · {day.mandatory.length === 0 ? "no mandatory tasks" : day.mandatory.every((m) => m.done) ? "mandatory complete ✓" : "mandatory incomplete"}</p>
          {day.total === 0 && day.mandatory.length + day.extra.length === 0 ? <p className="mt-3 text-sm text-muted">No tasks were scheduled.</p> : <DayTasks data={day} onProgress={onProgress} />}
        </section>
      )}
    </>
  );
}
