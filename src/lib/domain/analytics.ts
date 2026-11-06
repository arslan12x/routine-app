import { addDays, daysBetween, isoWeekday, monthOf, weekStart } from "./dates.ts";
import { isDone, logKey, scheduledOn, versionOn, weekDays } from "./schedule.ts";
import { computeStreaks, earliestStart, statusRange } from "./streaks.ts";
import type { Category, DateStr, LogMap, TaskDef } from "./types.ts";

export type Group = "day" | "week" | "month";
interface Instance { date: DateStr; mandatory: boolean; category: Category; done: boolean; weekly: boolean }

const bucketOf = (d: DateStr, g: Group, ws: 1 | 7): string => (g === "day" ? d : g === "week" ? weekStart(d, ws) : monthOf(d));
const rate = (c: number, s: number) => (s ? c / s : null);

function instances(tasks: TaskDef[], logs: LogMap, from: DateStr, to: DateStr, today: DateStr, ws: 1 | 7): Instance[] {
  const end = to > today ? today : to;
  const out: Instance[] = [];
  if (from > end) return out;
  for (const d of daysBetween(from, end)) {
    for (const t of tasks) {
      const v = scheduledOn(t, d);
      if (!v || v.recurrence === "WEEKLY_TOTAL") continue;
      out.push({ date: d, mandatory: v.isMandatory, category: t.category, done: isDone(v, logs.get(logKey(t.id, d))), weekly: false });
    }
  }
  // Weekly-total tasks: one instance per week, resolved only once the week has ended; attributed to its last day.
  for (let ws0 = weekStart(from, ws); ws0 <= end; ws0 = addDays(ws0, 7)) {
    const we = addDays(ws0, 6);
    if (we > today || we < from || we > end) continue;
    for (const t of tasks) {
      const probe = versionOn(t, we > t.startDate ? we : t.startDate);
      if (!probe || probe.recurrence !== "WEEKLY_TOTAL" || we < t.startDate) continue;
      const sum = weekDays(ws0).reduce((a, d) => a + (logs.get(logKey(t.id, d)) ?? 0), 0);
      out.push({ date: we, mandatory: false, category: t.category, done: sum >= probe.target, weekly: true });
    }
  }
  return out;
}

export function computeInsights(a: { tasks: TaskDef[]; logs: LogMap; from: DateStr; to: DateStr; group: Group; today: DateStr; weekStartsOn: 1 | 7 }) {
  const { tasks, logs, from, to, group, today, weekStartsOn: ws } = a;
  const inst = instances(tasks, logs, from, to, today, ws);
  const count = (xs: Instance[]) => ({ completed: xs.filter((i) => i.done).length, scheduled: xs.length });

  const mand = count(inst.filter((i) => i.mandatory));
  const extra = count(inst.filter((i) => !i.mandatory));
  const all = count(inst);

  const buckets = new Map<string, Instance[]>();
  for (const i of inst) {
    const k = bucketOf(i.date, group, ws);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i);
  }
  const trend = [...buckets.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([label, xs]) => ({ label, ...count(xs), rate: rate(count(xs).completed, xs.length) }));

  const cats = new Map<Category, Instance[]>();
  for (const i of inst) (cats.get(i.category) ?? cats.set(i.category, []).get(i.category)!).push(i);
  const categories = [...cats.entries()].map(([category, xs]) => ({ category, ...count(xs), rate: rate(count(xs).completed, xs.length) }));

  // Consistency (day-level) over the same range
  const start = earliestStart(tasks);
  const days = start ? statusRange(tasks, logs, from < start ? start : from, to > today ? today : to, today) : [];
  const cb = new Map<string, { s: number; f: number }>();
  for (const d of days) {
    if (d.status !== "SUCCESS" && d.status !== "FAILED") continue;
    const k = bucketOf(d.date, group, ws);
    const e = cb.get(k) ?? cb.set(k, { s: 0, f: 0 }).get(k)!;
    d.status === "SUCCESS" ? e.s++ : e.f++;
  }
  const consistencyTrend = [...cb.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([label, e]) => ({ label, rate: rate(e.s, e.s + e.f) }));
  const succ = days.filter((d) => d.status === "SUCCESS").length;
  const fail = days.filter((d) => d.status === "FAILED").length;

  // Best weekday by completion rate (needs >= 4 occurrences)
  const wd = new Map<number, { c: number; s: number }>();
  for (const i of inst.filter((x) => !x.weekly)) {
    const w = isoWeekday(i.date);
    const e = wd.get(w) ?? wd.set(w, { c: 0, s: 0 }).get(w)!;
    e.s++;
    if (i.done) e.c++;
  }
  let best: { weekday: number; rate: number } | null = null;
  for (const [weekday, e] of wd) {
    if (e.s < 4) continue;
    const r = e.c / e.s;
    if (!best || r > best.rate) best = { weekday, rate: r };
  }

  const st = computeStreaks(tasks, logs, today);
  return {
    kpis: {
      totalCompleted: all.completed,
      mandatoryRate: rate(mand.completed, mand.scheduled),
      extraRate: rate(extra.completed, extra.scheduled),
      overallRate: rate(all.completed, all.scheduled),
      consistency: rate(succ, succ + fail),
      currentStreak: st.current,
      longestStreak: st.longest,
      bestWeekday: best,
    },
    split: { mandatory: mand.completed, extra: extra.completed },
    trend,
    categories,
    consistencyTrend,
  };
}
