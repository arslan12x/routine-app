import { describe, it, expect } from "vitest";
import { todayIn } from "../src/lib/domain/dates.ts";
import { dayInfo, logKey } from "../src/lib/domain/schedule.ts";
import { computeStreaks, recentConsistency } from "../src/lib/domain/streaks.ts";
import { computeInsights } from "../src/lib/domain/analytics.ts";
import { rankRows } from "../src/lib/domain/ranking.ts";
import { getReminderSlot, isReminderHour, reminderMessage } from "../src/lib/domain/reminders.ts";
import type { LogMap, Recurrence, TaskDef, TaskVersion } from "../src/lib/domain/types.ts";

const ver = (o: Partial<TaskVersion> = {}): TaskVersion => ({
  effectiveFrom: "2026-11-01", isMandatory: true, completionType: "BOOLEAN", target: 1, unit: null,
  recurrence: "DAILY" as Recurrence, weekdays: [], ...o,
});
const task = (id: string, o: Partial<TaskDef> = {}, v: Partial<TaskVersion> = {}): TaskDef => ({
  id, title: id, description: null, category: "FITNESS", sortOrder: 0, startDate: "2026-11-01", archivedOn: null,
  isAiGated: false, aiSubject: null, aiCourseName: null, aiCoursePrompt: null,
  versions: [ver({ effectiveFrom: o.startDate ?? "2026-11-01", ...v })], ...o,
});
const logs = (id: string, days: [string, number][]): LogMap => new Map(days.map(([d, v]) => [logKey(id, d), v]));
const done = (id: string, ...days: string[]) => logs(id, days.map((d) => [d, 1]));

// Nov 2026: 1=Sun, 2=Mon ... 6=Fri, 7=Sat, 8=Sun, 9=Mon

describe("task reminders", () => {
  it("uses the user's timezone to identify the 9 PM reminder", () => {
    expect(getReminderSlot(new Date("2026-11-10T15:30:00.000Z"), "Asia/Kolkata")).toEqual({ date: "2026-11-10", hour: 21 });
  });
  it("allows a short scheduler delay but does not repeat outside the reminder window", () => {
    expect(getReminderSlot(new Date("2026-11-10T15:34:00.000Z"), "Asia/Kolkata")).toEqual({ date: "2026-11-10", hour: 21 });
    expect(getReminderSlot(new Date("2026-11-10T15:35:00.000Z"), "Asia/Kolkata")).toBeNull();
  });
  it("does not schedule reminders before 9 PM", () => {
    expect(getReminderSlot(new Date("2026-11-10T15:29:00.000Z"), "Asia/Kolkata")).toBeNull();
  });
  it("recognizes the 10 PM and 11 PM slots in the user's timezone", () => {
    expect(getReminderSlot(new Date("2026-11-10T16:30:00.000Z"), "Asia/Kolkata")).toEqual({ date: "2026-11-10", hour: 22 });
    expect(getReminderSlot(new Date("2026-11-10T17:30:00.000Z"), "Asia/Kolkata")).toEqual({ date: "2026-11-10", hour: 23 });
  });
  it("allows retries later in the same local hour but rejects a different hour or date", () => {
    const slot = { date: "2026-11-10", hour: 21 as const };
    expect(isReminderHour(new Date("2026-11-10T15:59:00.000Z"), "Asia/Kolkata", slot)).toBe(true);
    expect(isReminderHour(new Date("2026-11-10T16:30:00.000Z"), "Asia/Kolkata", slot)).toBe(false);
    expect(isReminderHour(new Date("2026-11-10T18:31:00.000Z"), "Asia/Kolkata", slot)).toBe(false);
  });
  it("includes remaining task count and hours left in the message", () => {
    expect(reminderMessage(1, 23)).toBe("You have 1 task left and 1 hour before the day ends.");
    expect(reminderMessage(3, 21)).toBe("You have 3 tasks left and 3 hours before the day ends.");
  });
});

describe("streaks", () => {
  it("counts consecutive completed days", () => {
    const s = computeStreaks([task("a")], done("a", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"), "2026-11-05");
    expect(s.current).toBe(5);
    expect(s.longest).toBe(5);
  });
  it("breaks when a mandatory task is missed", () => {
    const s = computeStreaks([task("a")], done("a", "2026-11-01", "2026-11-02", "2026-11-04", "2026-11-05"), "2026-11-05");
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
    expect(s.failedDays).toBe(1);
  });
  it("does not break the streak for an unfinished current day", () => {
    const s = computeStreaks([task("a")], done("a", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"), "2026-11-05");
    expect(s.current).toBe(4);
    expect(s.failedDays).toBe(0);
  });
  it("adds today once it is completed", () => {
    const s = computeStreaks([task("a")], done("a", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"), "2026-11-05");
    expect(s.current).toBe(5);
  });
  it("treats days with no mandatory tasks as neutral", () => {
    const extraOnly = task("x", {}, { isMandatory: false });
    const s = computeStreaks([extraOnly], new Map(), "2026-11-05");
    expect(s.current).toBe(0);
    expect(s.completionRate).toBeNull();
    expect(dayInfo([extraOnly], new Map(), "2026-11-03", "2026-11-05").status).toBe("NEUTRAL");
  });
  it("keeps a weekday-only streak alive across the weekend", () => {
    const t = task("w", { startDate: "2026-11-02" }, { recurrence: "WEEKDAYS", weekdays: [1, 2, 3, 4, 5] });
    const l = done("w", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09");
    const s = computeStreaks([t], l, "2026-11-09");
    expect(s.current).toBe(6);
    expect(dayInfo([t], l, "2026-11-07", "2026-11-09").status).toBe("NEUTRAL");
  });
  it("handles different recurrence schedules together", () => {
    const daily = task("d", { startDate: "2026-11-02" });
    const mwf = task("m", { startDate: "2026-11-02" }, { recurrence: "WEEKDAYS", weekdays: [1, 3, 5] });
    const l: LogMap = new Map([...done("d", "2026-11-02", "2026-11-03", "2026-11-04"), ...done("m", "2026-11-02", "2026-11-04")]);
    // Tuesday only needs the daily task
    expect(dayInfo([daily, mwf], l, "2026-11-03", "2026-11-04").status).toBe("SUCCESS");
    expect(computeStreaks([daily, mwf], l, "2026-11-04").current).toBe(3);
  });
  it("lets a backdated completion repair a broken streak", () => {
    const before = computeStreaks([task("a")], done("a", "2026-11-01", "2026-11-02", "2026-11-04", "2026-11-05"), "2026-11-05");
    const after = computeStreaks([task("a")], done("a", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"), "2026-11-05");
    expect(before.current).toBe(2);
    expect(after.current).toBe(5);
  });
  it("measurable tasks complete exactly at target", () => {
    const t = task("s", {}, { completionType: "MEASURABLE", target: 11000, unit: "steps" });
    expect(dayInfo([t], logs("s", [["2026-11-02", 10999]]), "2026-11-02", "2026-11-05").status).toBe("FAILED");
    expect(dayInfo([t], logs("s", [["2026-11-02", 11000]]), "2026-11-02", "2026-11-05").status).toBe("SUCCESS");
  });
  it("reports consistency only with enough countable days", () => {
    const l = done("a", "2026-11-01", "2026-11-02", "2026-11-03");
    expect(recentConsistency([task("a")], l, "2026-11-04").rate).toBeNull();
    expect(recentConsistency([task("a")], done("a", ...Array.from({ length: 8 }, (_, i) => `2026-11-0${i + 1}`)), "2026-11-09").rate).toBe(1);
  });
});

describe("history safety", () => {
  it("a later target change does not rewrite past days", () => {
    const t: TaskDef = { ...task("s"), versions: [
      ver({ completionType: "MEASURABLE", target: 10, effectiveFrom: "2026-11-01" }),
      ver({ completionType: "MEASURABLE", target: 20, effectiveFrom: "2026-11-04" }),
    ] };
    const l = logs("s", [["2026-11-02", 15], ["2026-11-05", 15], ["2026-11-06", 20]]);
    expect(dayInfo([t], l, "2026-11-02", "2026-11-06").status).toBe("SUCCESS");
    expect(dayInfo([t], l, "2026-11-05", "2026-11-06").status).toBe("FAILED");
    expect(dayInfo([t], l, "2026-11-06", "2026-11-06").status).toBe("SUCCESS");
  });
  it("archiving stops scheduling but keeps earlier results", () => {
    const t = task("a", { archivedOn: "2026-11-04" });
    const l = done("a", "2026-11-01", "2026-11-02", "2026-11-03");
    expect(dayInfo([t], l, "2026-11-03", "2026-11-06").status).toBe("SUCCESS");
    expect(dayInfo([t], l, "2026-11-04", "2026-11-06").status).toBe("NEUTRAL");
    expect(computeStreaks([t], l, "2026-11-06").longest).toBe(3);
  });
});

describe("timezones", () => {
  it("resolves the local date per timezone at the same instant", () => {
    const instant = new Date("2026-11-06T19:00:00Z");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-11-07"); // 00:30 IST next day
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-11-06");
    expect(todayIn("UTC", instant)).toBe("2026-11-06");
  });
  it("an unfinished new local day is pending, not failed", () => {
    const today = todayIn("Asia/Kolkata", new Date("2026-11-06T19:00:00Z"));
    const s = computeStreaks([task("a")], done("a", "2026-11-05", "2026-11-06"), today);
    expect(s.current).toBe(6 - 4); // Nov 1-4 failed, 5 & 6 done, Nov 7 pending
    expect(s.failedDays).toBe(4);
  });
});

describe("analytics", () => {
  it("uses ratio of totals, not average of daily percentages", () => {
    const a = task("a");
    const b = task("b", { startDate: "2026-11-02" }, { isMandatory: false });
    const c = task("c", { startDate: "2026-11-02" }, { isMandatory: false });
    const r = computeInsights({ tasks: [a, b, c], logs: done("a", "2026-11-01"), from: "2026-11-01", to: "2026-11-02", group: "day", today: "2026-11-02", weekStartsOn: 1 });
    expect(r.kpis.overallRate).toBe(0.25); // 1 of 4, not (100% + 0%) / 2
    expect(r.kpis.mandatoryRate).toBe(0.5);
    expect(r.split).toEqual({ mandatory: 1, extra: 0 });
  });
  it("counts a weekly-total task once, only after the week ends", () => {
    const w = task("w", { startDate: "2026-11-02" }, { isMandatory: false, recurrence: "WEEKLY_TOTAL", target: 3 });
    const l = done("w", "2026-11-02", "2026-11-04", "2026-11-06");
    const mid = computeInsights({ tasks: [w], logs: l, from: "2026-11-02", to: "2026-11-08", group: "week", today: "2026-11-06", weekStartsOn: 1 });
    const end = computeInsights({ tasks: [w], logs: l, from: "2026-11-02", to: "2026-11-08", group: "week", today: "2026-11-08", weekStartsOn: 1 });
    expect(mid.kpis.overallRate).toBeNull();
    expect(end.kpis.overallRate).toBe(1);
  });
});

describe("leaderboard ranking", () => {
  const row = (id: string, o: Record<string, unknown> = {}) => ({
    tiebreakId: id, displayName: id, image: null, currentStreak: 5, longestStreak: 5, consistency: 0.8 as number | null,
    successDays: 10, mandatoryPerDay: 2, joinedAt: "2026-01-01T00:00:00Z", ...o,
  });
  it("orders by streak, then consistency, then success days", () => {
    const r = rankRows([row("a", { currentStreak: 3 }), row("b", { consistency: 0.5 }), row("c"), row("d", { currentStreak: 5, consistency: 0.8, successDays: 20 })]);
    expect(r.map((x) => x.displayName)).toEqual(["d", "c", "b", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });
  it("sorts null consistency last and breaks full ties by join date then id", () => {
    const r = rankRows([row("z", { consistency: null }), row("y", { joinedAt: "2026-02-01T00:00:00Z" }), row("x")]);
    expect(r.map((x) => x.displayName)).toEqual(["x", "y", "z"]);
    const t = rankRows([row("b"), row("a")]);
    expect(t.map((x) => x.displayName)).toEqual(["a", "b"]);
  });
});
