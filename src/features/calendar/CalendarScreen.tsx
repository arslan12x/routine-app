"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, Skeleton, Stat } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { isoWeekday, monthRange, parse } from "@/lib/domain/dates";
import type { DayInfo } from "@/lib/domain/types";
import { api } from "@/lib/fetcher";
import DayTasks, { applyLocal } from "@/features/tasks/DayTasks";
import type { DayItem, DayView } from "@/server/services/tasks";

export interface CalendarData {
  month: string; today: string; weekStartsOn: 1 | 7; days: DayInfo[];
  summary: { current: number; longest: number; successDays: number; failedDays: number; completionRate: number | null; monthSuccessDays: number };
}

function look(d: DayInfo): { cls: string; glyph: string; label: string } {
  switch (d.status) {
    case "SUCCESS": return { cls: "bg-ok text-white", glyph: "✓", label: "all mandatory tasks done" };
    case "FAILED": return d.mandatoryDone > 0
      ? { cls: "bg-warn/25 text-fg border border-warn", glyph: "½", label: "partially completed" }
      : { cls: "bg-bad/20 text-bad border border-bad/50", glyph: "✕", label: "no mandatory tasks done" };
    case "PENDING": return { cls: "border-2 border-dashed border-brand", glyph: "…", label: "in progress" };
    case "NEUTRAL": return { cls: "bg-soft text-muted", glyph: "–", label: "no mandatory tasks scheduled" };
    default: return { cls: "text-muted/50", glyph: "", label: "upcoming" };
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

  const loadMonth = useCallback(async (m: string) => {
    setLoading(true);
    try { setCal(await api<CalendarData>(`/api/calendar?month=${m}`)); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, []);
  const loadDay = useCallback(async (d: string) => {
    try { setDay(await api<DayView>(`/api/calendar/${d}`)); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }, []);
  useEffect(() => { if (sel) loadDay(sel); }, [sel, loadDay]);

  const onProgress = async (item: DayItem, value: number) => {
    if (!day) return;
    setDay(applyLocal(day, item.id, value));
    try { await api(`/api/tasks/${item.id}/progress`, { method: "PUT", body: JSON.stringify({ date: day.date, value }) }); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    await Promise.all([loadDay(day.date), loadMonth(cal.month)]);
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
            {cal.days.map((d) => {
              const l = look(d); const n = Number(d.date.slice(8));
              return (
                <button key={d.date} disabled={d.status === "FUTURE"} onClick={() => setSel(d.date)} aria-pressed={sel === d.date}
                  aria-label={`${n} ${title}: ${l.label}`}
                  className={cn("relative grid aspect-square place-items-center rounded-xl text-sm font-medium transition", l.cls, sel === d.date && "ring-2 ring-fg ring-offset-2 ring-offset-card", d.date === cal.today && "underline underline-offset-4")}>
                  <span>{n}</span><span aria-hidden className="absolute bottom-0.5 text-[10px] leading-none opacity-80">{l.glyph}</span>
                </button>
              );
            })}
          </div>
        )}
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          <li>✓ all mandatory done</li><li>½ partial</li><li>✕ none done</li><li>– no mandatory tasks</li><li>… today, in progress</li>
        </ul>
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
