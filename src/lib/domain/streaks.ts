import { daysBetween, addDays } from "./dates.ts";
import { dayInfo } from "./schedule.ts";
import type { DateStr, DayInfo, LogMap, TaskDef } from "./types.ts";

export function statusRange(tasks: TaskDef[], logs: LogMap, from: DateStr, to: DateStr, today: DateStr): DayInfo[] {
  return daysBetween(from, to).map((d) => dayInfo(tasks, logs, d, today));
}

export const earliestStart = (tasks: TaskDef[]): DateStr | null =>
  tasks.length ? tasks.reduce((m, t) => (t.startDate < m ? t.startDate : m), tasks[0].startDate) : null;

export interface StreakSummary {
  current: number;
  longest: number;
  successDays: number;
  failedDays: number;
  completionRate: number | null; // success / (success + failed)
}

export function computeStreaks(tasks: TaskDef[], logs: LogMap, today: DateStr): StreakSummary {
  const start = earliestStart(tasks);
  const empty = { current: 0, longest: 0, successDays: 0, failedDays: 0, completionRate: null };
  if (!start || start > today) return empty;
  let run = 0, longest = 0, success = 0, failed = 0;
  for (const d of statusRange(tasks, logs, start, today, today)) {
    if (d.status === "SUCCESS") { run++; success++; longest = Math.max(longest, run); }
    else if (d.status === "FAILED") { run = 0; failed++; }
    // NEUTRAL and PENDING neither extend nor break
  }
  const countable = success + failed;
  return { current: run, longest, successDays: success, failedDays: failed, completionRate: countable ? success / countable : null };
}

/** Success / (success + failed) over the last `days` days; null when fewer than `minDays` countable days. */
export function recentConsistency(tasks: TaskDef[], logs: LogMap, today: DateStr, days = 30, minDays = 7) {
  const start = earliestStart(tasks);
  if (!start) return { rate: null as number | null, mandatoryPerDay: 0 };
  const from = addDays(today, -(days - 1));
  const range = statusRange(tasks, logs, from < start ? start : from, today, today);
  const s = range.filter((d) => d.status === "SUCCESS").length;
  const f = range.filter((d) => d.status === "FAILED").length;
  const withMandatory = range.filter((d) => d.mandatoryTotal > 0);
  const per = withMandatory.length ? withMandatory.reduce((a, d) => a + d.mandatoryTotal, 0) / withMandatory.length : 0;
  return { rate: s + f >= minDays ? s / (s + f) : null, mandatoryPerDay: Math.round(per * 10) / 10 };
}
