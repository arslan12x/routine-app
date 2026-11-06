import { addDays, isoWeekday } from "./dates.ts";
import type { DateStr, DayInfo, DayStatus, LogMap, TaskDef, TaskVersion } from "./types.ts";

export const logKey = (taskId: string, date: DateStr) => `${taskId}|${date}`;

/** The version in effect on `date`, or null if the task is not active then. */
export function versionOn(t: TaskDef, date: DateStr): TaskVersion | null {
  if (date < t.startDate) return null;
  if (t.archivedOn && date >= t.archivedOn) return null;
  let found: TaskVersion | null = null;
  for (const v of t.versions) {
    if (v.effectiveFrom <= date) found = v;
    else break;
  }
  return found;
}

/** The version if the task is scheduled on `date` (weekly-total tasks are available every day). */
export function scheduledOn(t: TaskDef, date: DateStr): TaskVersion | null {
  const v = versionOn(t, date);
  if (!v) return null;
  if (v.recurrence === "WEEKDAYS" && !v.weekdays.includes(isoWeekday(date))) return null;
  return v;
}

export const isDone = (v: TaskVersion, value: number | undefined): boolean => (value ?? 0) >= v.target;
export const progressOf = (v: TaskVersion, value: number | undefined): number =>
  Math.max(0, Math.min(1, (value ?? 0) / v.target));

/** Counts toward the daily streak: mandatory and not weekly-total. */
export const isDailyMandatory = (v: TaskVersion) => v.isMandatory && v.recurrence !== "WEEKLY_TOTAL";

/**
 * Day status rules:
 *  FUTURE  - after today
 *  NEUTRAL - no mandatory task scheduled (neither extends nor breaks a streak)
 *  SUCCESS - every scheduled mandatory task done
 *  PENDING - today, not finished yet (NOT a break)
 *  FAILED  - past day with an unfinished mandatory task
 */
export function dayInfo(tasks: TaskDef[], logs: LogMap, date: DateStr, today: DateStr): DayInfo {
  let mandatoryTotal = 0, mandatoryDone = 0, total = 0, done = 0;
  for (const t of tasks) {
    const v = scheduledOn(t, date);
    if (!v || v.recurrence === "WEEKLY_TOTAL") continue;
    const ok = isDone(v, logs.get(logKey(t.id, date)));
    total++;
    if (ok) done++;
    if (v.isMandatory) {
      mandatoryTotal++;
      if (ok) mandatoryDone++;
    }
  }
  let status: DayStatus;
  if (date > today) status = "FUTURE";
  else if (mandatoryTotal === 0) status = "NEUTRAL";
  else if (mandatoryDone === mandatoryTotal) status = "SUCCESS";
  else status = date === today ? "PENDING" : "FAILED";
  return { date, status, mandatoryTotal, mandatoryDone, total, done };
}

export const weekDays = (start: DateStr): DateStr[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));
