import { describe, it, expect } from "vitest";
import { addDays, todayIn } from "../src/lib/domain/dates.ts";
import { dayInfo, logKey } from "../src/lib/domain/schedule.ts";
import { computeStreaks, recentConsistency } from "../src/lib/domain/streaks.ts";
import { computeInsights } from "../src/lib/domain/analytics.ts";
import { rankRows } from "../src/lib/domain/ranking.ts";
import { shouldRejectStaleWrite } from "../src/lib/domain/sync.ts";
import { matchTaskToHealthMetric } from "../src/lib/native-health.ts";
import { getReminderSlot, isReminderHour, reminderMessage } from "../src/lib/domain/reminders.ts";
import { evaluateEligibleBadges, BADGE_DEFINITIONS } from "../src/lib/domain/achievements.ts";
import { isValidNovelRedirectUrl } from "../src/lib/domain/novels.ts";
import { buildSmartReminderPrompt } from "../src/server/ai/reminders.ts";
import { buildFallbackCoachReview } from "../src/server/ai/coach.ts";
import { computeTaskStreakAndCompletedDays } from "../src/server/ai/learning-context.ts";
import { buildFallbackBlogPlan, buildFallbackMarkdown } from "../src/server/services/blogs.ts";
import { CsvFinancialProvider } from "../src/server/finance/csv-provider.ts";
import {
  calculateNextStageTransition,
  shouldPromoteFollowUp,
  isValidHrEmail,
  extractAndValidateEmails,
  COMPANY_CATEGORIES,
  FOLLOWUP_DAY_OFFSETS,
  CANDIDATE_EXPERIENCE_LEVELS,
  inferExperienceLevelFromTitle,
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVEL_SHORT_LABELS,
} from "../src/lib/domain/jobs.ts";
import { encryptSecret, decryptSecret } from "../src/lib/crypto.ts";
import {
  getEmailProviderPreset,
  matchRecruiterReply,
  extractEmailAddress,
} from "../src/lib/domain/email-config.ts";
import { buildFallbackEmail } from "../src/server/ai/jobs.ts";
import { extractSkillsFromText } from "../src/server/services/jobs.ts";
import { CURATED_COMPANIES, getRoleForExperience } from "../src/server/services/job-scraper.ts";
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

describe("last-write-wins (LWW) conflict evaluation", () => {
  it("rejects an update if the database timestamp is newer than the client payload", () => {
    const dbUpdatedAt = new Date("2026-11-14T12:00:00Z");
    const staleClientPayload = "2026-11-14T11:59:00Z";
    expect(shouldRejectStaleWrite(dbUpdatedAt, staleClientPayload)).toBe(true);
  });

  it("accepts an update if the client payload is newer than the database timestamp", () => {
    const dbUpdatedAt = new Date("2026-11-14T12:00:00Z");
    const freshClientPayload = "2026-11-14T12:05:00Z";
    expect(shouldRejectStaleWrite(dbUpdatedAt, freshClientPayload)).toBe(false);
  });

  it("accepts an update if timestamps are identical", () => {
    const dbUpdatedAt = new Date("2026-11-14T12:00:00Z");
    const sameClientPayload = "2026-11-14T12:00:00Z";
    expect(shouldRejectStaleWrite(dbUpdatedAt, sameClientPayload)).toBe(false);
  });

  it("accepts an update if there is no existing database record or no client timestamp", () => {
    expect(shouldRejectStaleWrite(null, "2026-11-14T12:00:00Z")).toBe(false);
    expect(shouldRejectStaleWrite(undefined, "2026-11-14T12:00:00Z")).toBe(false);
    expect(shouldRejectStaleWrite(new Date("2026-11-14T12:00:00Z"), undefined)).toBe(false);
    expect(shouldRejectStaleWrite(new Date("2026-11-14T12:00:00Z"), null)).toBe(false);
  });

  it("handles invalid date strings gracefully without throwing", () => {
    expect(shouldRejectStaleWrite(new Date("2026-11-14T12:00:00Z"), "invalid-iso-date")).toBe(false);
  });
});

describe("milestone badges and achievements", () => {
  it("evaluates streak milestones for 7-day and 30-day streaks", () => {
    const t = task("t1");
    const emptyLogs: LogMap = new Map();

    const badges7 = evaluateEligibleBadges({
      tasks: [t],
      logs: emptyLogs,
      currentStreak: 7,
      longestStreak: 7,
      consistencyRate: 0.8,
      successDays: 7,
    });
    expect(badges7).toContain("STREAK_7");
    expect(badges7).not.toContain("STREAK_30");

    const badges30 = evaluateEligibleBadges({
      tasks: [t],
      logs: emptyLogs,
      currentStreak: 30,
      longestStreak: 30,
      consistencyRate: 0.9,
      successDays: 30,
    });
    expect(badges30).toContain("STREAK_7");
    expect(badges30).toContain("STREAK_30");
  });

  it("evaluates AI study sessions milestones for 10 and 100 sessions", () => {
    const aiTask = task("ai-study", { isAiGated: true, aiSubject: "DSA" });
    const aiLogs: LogMap = new Map();

    for (let i = 0; i < 10; i++) {
      const d = addDays("2026-11-01", i);
      aiLogs.set(logKey("ai-study", d), 1);
    }

    const badges10 = evaluateEligibleBadges({
      tasks: [aiTask],
      logs: aiLogs,
      currentStreak: 10,
      longestStreak: 10,
      consistencyRate: 1.0,
      successDays: 10,
    });
    expect(badges10).toContain("AI_SESSIONS_10");
    expect(badges10).toContain("FIRST_STEP");
    expect(badges10).not.toContain("AI_SESSIONS_100");

    // Add up to 100 sessions
    for (let i = 10; i < 100; i++) {
      const d = addDays("2026-11-01", i);
      aiLogs.set(logKey("ai-study", d), 1);
    }

    const badges100 = evaluateEligibleBadges({
      tasks: [aiTask],
      logs: aiLogs,
      currentStreak: 100,
      longestStreak: 100,
      consistencyRate: 1.0,
      successDays: 100,
    });
    expect(badges100).toContain("AI_SESSIONS_100");
    expect(badges100).toContain("TASK_CENTURY");
  });

  it("evaluates flawless week milestone when 100% consistent across 7+ days", () => {
    const t = task("walk");
    const badges = evaluateEligibleBadges({
      tasks: [t],
      logs: new Map(),
      currentStreak: 7,
      longestStreak: 7,
      consistencyRate: 1.0,
      successDays: 7,
    });
    expect(badges).toContain("PERFECT_WEEK");
  });

  it("all badge definitions have valid labels and icons", () => {
    for (const key of Object.keys(BADGE_DEFINITIONS)) {
      const def = BADGE_DEFINITIONS[key];
      expect(def.badgeType).toBe(key);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(["Flame", "Trophy", "Brain", "GraduationCap", "CheckCircle2", "ShieldCheck", "Zap"]).toContain(def.icon);
    }
  });
});

describe("smart push reminders prompt construction", () => {
  it("formats contextual reminder prompt containing remaining tasks and streak", () => {
    const prompt = buildSmartReminderPrompt({
      displayName: "Alex",
      remainingTaskTitles: ["Read 10 pages", "10,000 steps"],
      remainingCount: 2,
      mandatoryCount: 1,
      streak: 5,
      hour: 21,
    });
    expect(prompt).toContain("Current streak: 5 days");
    expect(prompt).toContain("Remaining tasks: 2 (1 mandatory)");
    expect(prompt).toContain("Read 10 pages, 10,000 steps");
    expect(prompt).toContain("3 hours left before midnight");
  });
});

describe("weekly AI routine coach review", () => {
  it("generates motivating feedback and tip for high completion rate (>= 80%)", () => {
    const result = buildFallbackCoachReview(0.85, 12, "Morning Run");
    expect(result.review).toContain("85%");
    expect(result.review).toContain("12-day streak");
    expect(result.review).toContain("Morning Run");
    expect(result.actionableTip.length).toBeGreaterThan(10);
  });

  it("generates habit-stacking guidance for moderate completion rate (50-79%)", () => {
    const result = buildFallbackCoachReview(0.65, 4);
    expect(result.review).toContain("65%");
    expect(result.actionableTip).toContain("habit-stacking");
  });

  it("generates barrier-reduction guidance for low completion rate (< 50%)", () => {
    const result = buildFallbackCoachReview(0.3, 0);
    expect(result.review).toContain("30%");
    expect(result.actionableTip).toContain("single top mandatory habit");
  });
});

describe("native health metric task matching", () => {
  it("matches step tasks by unit or title", () => {
    expect(matchTaskToHealthMetric({ title: "Daily Walk", unit: "steps", completionType: "MEASURABLE" })).toBe("STEPS");
    expect(matchTaskToHealthMetric({ title: "10,000 Steps", unit: null, completionType: "MEASURABLE" })).toBe("STEPS");
    expect(matchTaskToHealthMetric({ title: "Walking the dog", unit: "step", completionType: "MEASURABLE" })).toBe("STEPS");
  });

  it("matches workout minutes for fitness tasks by minute unit", () => {
    expect(matchTaskToHealthMetric({ title: "Morning Gym", category: "FITNESS", unit: "mins", completionType: "MEASURABLE" })).toBe("WORKOUT_MINUTES");
    expect(matchTaskToHealthMetric({ title: "Cardio exercise", category: "HEALTH", unit: "min", completionType: "MEASURABLE" })).toBe("WORKOUT_MINUTES");
    expect(matchTaskToHealthMetric({ title: "Workout duration", category: "OTHER", unit: "minutes", completionType: "MEASURABLE" })).toBe("WORKOUT_MINUTES");
  });

  it("ignores non-measurable tasks and unrelated tasks", () => {
    expect(matchTaskToHealthMetric({ title: "10,000 Steps", unit: "steps", completionType: "BOOLEAN" })).toBeNull();
    expect(matchTaskToHealthMetric({ title: "Read 20 pages", category: "LEARNING", unit: "pages", completionType: "MEASURABLE" })).toBeNull();
    expect(matchTaskToHealthMetric({ title: "Drink 2L Water", category: "HEALTH", unit: "liters", completionType: "MEASURABLE" })).toBeNull();
  });
});

describe("safe public-domain novel URL validation", () => {
  it("allows trusted public-domain hosts", () => {
    expect(isValidNovelRedirectUrl("https://www.gutenberg.org/ebooks/1342")).toBe(true);
    expect(isValidNovelRedirectUrl("https://gutenberg.org/ebooks/84.html.images")).toBe(true);
    expect(isValidNovelRedirectUrl("https://openlibrary.org/works/OL12345W")).toBe(true);
    expect(isValidNovelRedirectUrl("https://archive.org/details/frankenstein")).toBe(true);
    expect(isValidNovelRedirectUrl("https://www.archive.org/details/dracula")).toBe(true);
    expect(isValidNovelRedirectUrl("https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice")).toBe(true);
  });

  it("rejects unauthorized, suspicious, or malicious domains", () => {
    expect(isValidNovelRedirectUrl("https://evil.com/read")).toBe(false);
    expect(isValidNovelRedirectUrl("https://phishing-gutenberg.org/novel")).toBe(false);
    expect(isValidNovelRedirectUrl("https://not-gutenberg.org")).toBe(false);
    expect(isValidNovelRedirectUrl("https://gutenberg.org.attacker.com")).toBe(false);
  });

  it("rejects unsafe protocols and malformed strings", () => {
    expect(isValidNovelRedirectUrl("javascript:alert(1)")).toBe(false);
    expect(isValidNovelRedirectUrl("data:text/html,<h1>Phish</h1>")).toBe(false);
    expect(isValidNovelRedirectUrl("ftp://gutenberg.org/book.txt")).toBe(false);
    expect(isValidNovelRedirectUrl("not a url")).toBe(false);
  });
});

describe("leaderboard row routing attributes", () => {
  it("preserves userId and isFriend flag when ranking rows", () => {
    const rows = [
      {
        userId: "user-1",
        isFriend: true,
        displayName: "Alice",
        image: null,
        currentStreak: 10,
        longestStreak: 10,
        consistency: 0.9,
        successDays: 15,
        mandatoryPerDay: 2,
        joinedAt: "2026-01-01T00:00:00Z",
        tiebreakId: "user-1",
      },
      {
        userId: "user-2",
        isFriend: false,
        displayName: "Bob",
        image: null,
        currentStreak: 5,
        longestStreak: 8,
        consistency: 0.7,
        successDays: 8,
        mandatoryPerDay: 2,
        joinedAt: "2026-01-02T00:00:00Z",
        tiebreakId: "user-2",
      },
    ];

    const ranked = rankRows(rows);
    expect(ranked[0].userId).toBe("user-1");
    expect(ranked[0].isFriend).toBe(true);
    expect(ranked[0].rank).toBe(1);

    expect(ranked[1].userId).toBe("user-2");
    expect(ranked[1].isFriend).toBe(false);
    expect(ranked[1].rank).toBe(2);
  });
});

describe("Phase 5: AI adaptive learning course memory context", () => {
    it("handles 0 completed days by defaulting to Day 1 onboarding foundations", () => {
      const t = task("dsa-task", { startDate: "2026-11-01" });
      const emptyLogs = new Map<string, number>();
      const result = computeTaskStreakAndCompletedDays(t, emptyLogs, "2026-11-05");

      expect(result.completedDays).toBe(0);
      expect(result.streak).toBe(0);
    });

    it("calculates exact unique completed days and active streak for multi-day logs", () => {
      const t = task("dsa-task", { startDate: "2026-11-01" });
      const logMap = new Map<string, number>([
        [logKey("dsa-task", "2026-11-01"), 1],
        [logKey("dsa-task", "2026-11-02"), 1],
        [logKey("dsa-task", "2026-11-03"), 1],
        [logKey("dsa-task", "2026-11-04"), 1],
        [logKey("dsa-task", "2026-11-05"), 1],
      ]);

      const result = computeTaskStreakAndCompletedDays(t, logMap, "2026-11-05");
      expect(result.completedDays).toBe(5);
      expect(result.streak).toBe(5);

      // Verify module mapping
      const currentDay = result.completedDays + 1; // Day 6
      const currentModule = Math.floor(result.completedDays / 5) + 1; // Module 2
      expect(currentDay).toBe(6);
      expect(currentModule).toBe(2);
    });

    it("detects skipped day for AI guided study tasks and enforces consistency penalty with minimum 10 exercises on previous topics", () => {
      // User completed Nov 1, Nov 2, Nov 3, then SKIPPED Nov 4 (yesterday). Today is Nov 5.
      const t = task("dsa-task", { startDate: "2026-11-01", isAiGated: true, aiSubject: "DSA" });
      const logMap = new Map<string, number>([
        [logKey("dsa-task", "2026-11-01"), 1],
        [logKey("dsa-task", "2026-11-02"), 1],
        [logKey("dsa-task", "2026-11-03"), 1],
        // 2026-11-04 is missing (skipped)
      ]);

      const result = computeTaskStreakAndCompletedDays(t, logMap, "2026-11-05");
      expect(result.completedDays).toBe(3);
      expect(result.streak).toBe(0); // Streak broken
      expect(result.hasSkippedDays).toBe(true);
      expect(result.missedDaysCount).toBe(1);
      expect(result.missedDates).toContain("2026-11-04");
      expect(result.penaltyRequired).toBe(true);
      // Strictly enforces minimum 10 exercises
      expect(result.penaltyExerciseCount).toBe(10);
    });

    it("scales penalty exercises up to 15 questions for multi-day skips", () => {
      // User completed Nov 1, then skipped Nov 2, 3, 4, 5, 6, 7 (6 skipped days). Today is Nov 8.
      const t = task("dsa-task", { startDate: "2026-11-01", isAiGated: true, aiSubject: "DSA" });
      const logMap = new Map<string, number>([
        [logKey("dsa-task", "2026-11-01"), 1],
      ]);

      const result = computeTaskStreakAndCompletedDays(t, logMap, "2026-11-08");
      expect(result.completedDays).toBe(1);
      expect(result.streak).toBe(0);
      expect(result.hasSkippedDays).toBe(true);
      expect(result.missedDaysCount).toBe(6);
      expect(result.penaltyRequired).toBe(true);
      // Strictly capped at maximum 15 exercises (range 10-15)
      expect(result.penaltyExerciseCount).toBe(15);
    });

    it("does not enforce penalty when consecutive study streak is intact", () => {
      // User did Nov 1, 2, 3, 4. Today is Nov 5.
      const t = task("dsa-task", { startDate: "2026-11-01", isAiGated: true, aiSubject: "DSA" });
      const logMap = new Map<string, number>([
        [logKey("dsa-task", "2026-11-01"), 1],
        [logKey("dsa-task", "2026-11-02"), 1],
        [logKey("dsa-task", "2026-11-03"), 1],
        [logKey("dsa-task", "2026-11-04"), 1],
      ]);

      const result = computeTaskStreakAndCompletedDays(t, logMap, "2026-11-05");
      expect(result.completedDays).toBe(4);
      expect(result.streak).toBe(4);
      expect(result.hasSkippedDays).toBe(false);
      expect(result.missedDaysCount).toBe(0);
      expect(result.penaltyRequired).toBe(false);
      expect(result.penaltyExerciseCount).toBe(0);
    });
  });

  describe("Phase 5: Multi-day AI blog plan generator", () => {
    it("generates structured progressive plan with exact totalDays without overlapping", () => {
      const topic = "Distributed Systems in Go";
      const totalDays = 5;
      const plan = buildFallbackBlogPlan(topic, totalDays);

      expect(plan).toHaveLength(5);
      expect(plan.map((p) => p.dayNumber)).toEqual([1, 2, 3, 4, 5]);

      // Ensure each day has a unique title and distinct subtopics
      const titles = new Set(plan.map((p) => p.title));
      expect(titles.size).toBe(5);

      for (const day of plan) {
        expect(day.subtopics.length).toBeGreaterThanOrEqual(2);
        expect(day.summaryGoal.length).toBeGreaterThan(10);
      }
    });

    it("generates markdown content with narrative continuity from previous day", () => {
      const topic = "PostgreSQL Indexing";
      const md = buildFallbackMarkdown(
        topic,
        2,
        5,
        "Day 2: B-Trees & Hash Indexes",
        ["B-Tree Anatomy", "Hash Index Limitations"],
        "Foundational table scans and cost models"
      );

      expect(md).toContain("# Day 2: B-Trees & Hash Indexes");
      expect(md).toContain("Recap from Day 1");
      expect(md).toContain("Foundational table scans and cost models");
      expect(md).toContain("B-Tree Anatomy");
      expect(md).toContain("Day 3");
    });
  });

  describe("Phase 6: Financial provider CSV parsing and category inference", () => {
    it("parses standard CSV statement with headers, currencies, and commas", async () => {
      const provider = new CsvFinancialProvider();
      const csv = `
Date,Description,Amount,Category,PaymentMethod
2026-11-01,"Whole Foods Supermarket",$125.50,Groceries,CARD
2026-11-02,"Uber Technologies Inc",-24.80,Transport,CARD
2026-11-03,"Starbucks Coffee",6.75,Dining,UPI
      `.trim();

      const transactions = await provider.parseTransactions(csv);
      expect(transactions).toHaveLength(3);

      expect(transactions[0].description).toBe("Whole Foods Supermarket");
      expect(transactions[0].amount).toBe(125.5);
      expect(transactions[0].category).toBe("Groceries");
      expect(transactions[0].paymentMethod).toBe("CARD");

      // Verify absolute debit amount parsing
      expect(transactions[1].amount).toBe(24.8);
      expect(transactions[1].category).toBe("Transport");

      expect(transactions[2].amount).toBe(6.75);
      expect(transactions[2].category).toBe("Dining");
      expect(transactions[2].paymentMethod).toBe("UPI");
    });

    it("accurately infers categories when category is omitted in statement", async () => {
      const provider = new CsvFinancialProvider();
      const csv = `
Date,Description,Amount
2026-11-04,"Netflix Subscription",19.99
2026-11-05,"Trader Joe's Grocery",55.10
2026-11-06,"ConEd Electric Power",140.00
2026-11-07,"Amazon Prime Retail",35.50
      `.trim();

      const transactions = await provider.parseTransactions(csv);
      expect(transactions).toHaveLength(4);

      expect(transactions[0].category).toBe("Entertainment");
      expect(transactions[1].category).toBe("Groceries");
      expect(transactions[2].category).toBe("Utilities");
      expect(transactions[3].category).toBe("Shopping");
    });
  });

  describe("Phase 7: Automated Job Application Engine & 4-Stage Shifting State Machine", () => {
    const appliedAt = new Date("2026-11-01T10:00:00.000Z");
    const dayMs = 24 * 60 * 60 * 1000;

    it("shifts from TO_APPLY to WAITING_FU1 with nextActionAt set to +4 days", () => {
      const transition = calculateNextStageTransition("TO_APPLY", appliedAt);
      expect(transition.nextStage).toBe("WAITING_FU1");
      expect(transition.nextActionAt).toEqual(new Date(appliedAt.getTime() + 4 * dayMs));
    });

    it("shifts from FOLLOW_UP_1 to WAITING_FU2 with nextActionAt set to +10 days from initial apply", () => {
      const transition = calculateNextStageTransition("FOLLOW_UP_1", appliedAt);
      expect(transition.nextStage).toBe("WAITING_FU2");
      expect(transition.nextActionAt).toEqual(new Date(appliedAt.getTime() + 10 * dayMs));
    });

    it("shifts from FOLLOW_UP_2 to WAITING_FU3 with nextActionAt set to +15 days from initial apply", () => {
      const transition = calculateNextStageTransition("FOLLOW_UP_2", appliedAt);
      expect(transition.nextStage).toBe("WAITING_FU3");
      expect(transition.nextActionAt).toEqual(new Date(appliedAt.getTime() + 15 * dayMs));
    });

    it("shifts from FOLLOW_UP_3 to CLOSED with nextActionAt set to null", () => {
      const transition = calculateNextStageTransition("FOLLOW_UP_3", appliedAt);
      expect(transition.nextStage).toBe("CLOSED");
      expect(transition.nextActionAt).toBeNull();
    });

    it("evaluates buffer state promotion only when schedule window arrives", () => {
      const dueDay4 = new Date(appliedAt.getTime() + 4 * dayMs);
      const beforeDue = new Date(appliedAt.getTime() + 3 * dayMs);
      const afterDue = new Date(appliedAt.getTime() + 4.5 * dayMs);

      expect(shouldPromoteFollowUp("WAITING_FU1", dueDay4, beforeDue)).toBeNull();
      expect(shouldPromoteFollowUp("WAITING_FU1", dueDay4, afterDue)).toBe("FOLLOW_UP_1");

      const dueDay10 = new Date(appliedAt.getTime() + 10 * dayMs);
      expect(shouldPromoteFollowUp("WAITING_FU2", dueDay10, dueDay10)).toBe("FOLLOW_UP_2");

      const dueDay15 = new Date(appliedAt.getTime() + 15 * dayMs);
      expect(shouldPromoteFollowUp("WAITING_FU3", dueDay15, dueDay15)).toBe("FOLLOW_UP_3");
    });

    it("validates HR emails and rejects invalid or disposable addresses", () => {
      expect(isValidHrEmail("careers@stripe.com")).toBe(true);
      expect(isValidHrEmail("talent.acquisition@microsoft.com")).toBe(true);
      expect(isValidHrEmail("hiring@cortexflow.ai")).toBe(true);

      // Invalid formats
      expect(isValidHrEmail("not-an-email")).toBe(false);
      expect(isValidHrEmail("@missinguser.com")).toBe(false);
      expect(isValidHrEmail("user@missingtld")).toBe(false);

      // Disposable domains
      expect(isValidHrEmail("spammer@mailinator.com")).toBe(false);
      expect(isValidHrEmail("fake@tempmail.com")).toBe(false);
    });

    it("extracts and deduplicates valid HR emails from unstructured text", () => {
      const text = `
        Please reach out to our team at careers@company.com or talent@company.com.
        Duplicate mention: careers@company.com.
        Ignore spam bots like test@mailinator.com or malformed@com.
      `;
      const extracted = extractAndValidateEmails(text);
      expect(extracted).toEqual(["careers@company.com", "talent@company.com"]);
    });

    it("supports all 7 company categories with curated listings", () => {
      expect(COMPANY_CATEGORIES).toHaveLength(7);
      expect(COMPANY_CATEGORIES).toContain("STARTUP");
      expect(COMPANY_CATEGORIES).toContain("BIG_MNC");
      expect(COMPANY_CATEGORIES).toContain("BIG_SHARKS");
      expect(COMPANY_CATEGORIES).toContain("ACTIVELY_HIRING");
      expect(COMPANY_CATEGORIES).toContain("MID_MNC");
      expect(COMPANY_CATEGORIES).toContain("SMALL_SCALE");
      expect(COMPANY_CATEGORIES).toContain("FOREIGN");

      expect(CURATED_COMPANIES.length).toBeGreaterThanOrEqual(35);

      for (const cat of COMPANY_CATEGORIES) {
        const categoryCompanies = CURATED_COMPANIES.filter((c) => c.category === cat);
        expect(categoryCompanies.length).toBeGreaterThanOrEqual(3);
        for (const comp of categoryCompanies) {
          expect(isValidHrEmail(comp.hrEmail)).toBe(true);
        }
      }
    });

    it("extracts skills accurately from resume text", () => {
      const resume = `
        Senior Full-Stack Engineer with 6+ years designing scalable cloud architectures.
        Core Stack: TypeScript, React, Next.js, Node.js, PostgreSQL, Docker, AWS, GraphQL, and Redis.
        Led migration to microservices with CI/CD and Vitest.
      `;
      const skills = extractSkillsFromText(resume);
      expect(skills).toContain("TypeScript");
      expect(skills).toContain("React");
      expect(skills).toContain("Next.js");
      expect(skills).toContain("PostgreSQL");
      expect(skills).toContain("AWS");
      expect(skills).toContain("Docker");
    });

    it("generates distinct, non-repetitive email copies across all 4 pipeline stages", () => {
      const input = {
        candidateName: "Alex Rivera",
        jobTitle: "Senior Systems Engineer",
        companyName: "Stripe",
        hrEmail: "careers@stripe.com",
        skills: ["TypeScript", "Distributed Systems", "PostgreSQL"],
      };

      const day0 = buildFallbackEmail({ ...input, stage: "APPLY" });
      const day4 = buildFallbackEmail({ ...input, stage: "FOLLOW_UP_1" });
      const day10 = buildFallbackEmail({ ...input, stage: "FOLLOW_UP_2" });
      const day15 = buildFallbackEmail({ ...input, stage: "FOLLOW_UP_3" });

      expect(day0.subject).toContain("Application: Senior Systems Engineer - Alex Rivera");
      expect(day0.body).toContain("attached my resume");

      expect(day4.subject).toContain("Following up:");
      expect(day4.body).toContain("quickly follow up on my application");
      expect(day4.body).not.toContain("reflecting on common technical hurdles");

      expect(day10.subject).toContain("Additional context & project insights");
      expect(day10.body).toContain("reflecting on common technical hurdles");

      expect(day15.subject).toContain("Final follow-up");
      expect(day15.body).toContain("one final check-in");
    });

    it("infers candidate experience level from job title correctly", () => {
      expect(inferExperienceLevelFromTitle("Graduate Software Engineer (Fresher / 0-1 Yrs)")).toBe("FRESHER");
      expect(inferExperienceLevelFromTitle("Junior Frontend Developer (1-3 Yrs)")).toBe("JUNIOR");
      expect(inferExperienceLevelFromTitle("Software Development Engineer I")).toBe("JUNIOR");
      expect(inferExperienceLevelFromTitle("Software Development Engineer II (3-5 Yrs)")).toBe("MID");
      expect(inferExperienceLevelFromTitle("Senior / Lead Backend Engineer (5+ Yrs)")).toBe("SENIOR");
      expect(inferExperienceLevelFromTitle("Principal Distributed Systems Architect")).toBe("SENIOR");
      expect(inferExperienceLevelFromTitle("Software Intern (Entry Level)")).toBe("FRESHER");
    });

    it("supports all 4 experience levels with friendly labels and short descriptions", () => {
      expect(CANDIDATE_EXPERIENCE_LEVELS).toEqual(["FRESHER", "JUNIOR", "MID", "SENIOR"]);
      for (const level of CANDIDATE_EXPERIENCE_LEVELS) {
        expect(EXPERIENCE_LEVEL_LABELS[level]).toBeDefined();
        expect(EXPERIENCE_LEVEL_SHORT_LABELS[level]).toBeDefined();
      }
    });

    it("tailors role curation for fresher vs experienced candidates", () => {
      const stripe = CURATED_COMPANIES.find((c) => c.name === "Stripe");
      expect(stripe).toBeDefined();

      const fresherRole = getRoleForExperience(stripe, "FRESHER");
      expect(fresherRole.toLowerCase()).toMatch(/fresher|graduate|associate|0-1/);

      const juniorRole = getRoleForExperience(stripe, "JUNIOR");
      expect(juniorRole.toLowerCase()).toMatch(/junior|sde i|1-3/);

      const midRole = getRoleForExperience(stripe, "MID");
      expect(midRole.toLowerCase()).toMatch(/sde ii|mid|3-5/);

      const seniorRole = getRoleForExperience(stripe, "SENIOR");
      expect(seniorRole.toLowerCase()).toMatch(/senior|lead|5\+/);
    });

    it("customizes AI email draft pitch tone for freshers vs experienced candidates", () => {
      const input = {
        candidateName: "Priya Sharma",
        jobTitle: "Associate Software Engineer",
        companyName: "Google",
        hrEmail: "jobs@google.com",
        skills: ["Java", "Data Structures", "Next.js"],
      };

      const fresherEmail = buildFallbackEmail({
        ...input,
        stage: "APPLY",
        experienceLevel: "FRESHER",
      });
      expect(fresherEmail.body).toContain("fresh energy and fast adaptability");
      expect(fresherEmail.body).toContain("aspiring software engineer");

      const experiencedEmail = buildFallbackEmail({
        ...input,
        stage: "APPLY",
        experienceLevel: "SENIOR",
      });
      expect(experiencedEmail.body).toContain("deep hands-on expertise");
      expect(experiencedEmail.body).toContain("consistently built resilient");
    });
  });

  describe("Direct SMTP & IMAP email integration and recruiter reply matching", () => {
    const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

    it("encryptSecret and decryptSecret perform round-trip encryption and catch tampering", () => {
      process.env.EMAIL_ENCRYPTION_KEY = "test-secret-encryption-key-for-unit-testing!";
      const plainSecret = "abcd efgh ijkl mnop";

      const encrypted = encryptSecret(plainSecret);
      expect(encrypted).not.toBe(plainSecret);
      expect(encrypted.split(":")).toHaveLength(3);

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(plainSecret);

      // Tampering test: alter the ciphertext
      const parts = encrypted.split(":");
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}aa`;
      expect(() => decryptSecret(tampered)).toThrow();

      // Missing encryption key error handling
      delete process.env.EMAIL_ENCRYPTION_KEY;
      expect(() => encryptSecret("fail")).toThrow(/EMAIL_ENCRYPTION_KEY/);

      // Restore key
      process.env.EMAIL_ENCRYPTION_KEY = originalKey;
    });

    it("getEmailProviderPreset returns correct SMTP and IMAP configs for all presets", () => {
      const gmail = getEmailProviderPreset("GMAIL");
      expect(gmail.smtpHost).toBe("smtp.gmail.com");
      expect(gmail.smtpPort).toBe(465);
      expect(gmail.smtpSecure).toBe(true);
      expect(gmail.imapHost).toBe("imap.gmail.com");
      expect(gmail.imapPort).toBe(993);
      expect(gmail.imapSecure).toBe(true);

      const outlook = getEmailProviderPreset("OUTLOOK");
      expect(outlook.smtpHost).toBe("smtp.office365.com");
      expect(outlook.smtpPort).toBe(587);
      expect(outlook.smtpSecure).toBe(false);
      expect(outlook.imapHost).toBe("outlook.office365.com");
      expect(outlook.imapPort).toBe(993);
      expect(outlook.imapSecure).toBe(true);

      const zoho = getEmailProviderPreset("ZOHO");
      expect(zoho.smtpHost).toBe("smtp.zoho.com");
      expect(zoho.smtpPort).toBe(465);
      expect(zoho.smtpSecure).toBe(true);
      expect(zoho.imapHost).toBe("imap.zoho.com");
      expect(zoho.imapPort).toBe(993);

      const custom = getEmailProviderPreset("CUSTOM");
      expect(custom.smtpPort).toBe(587);
      expect(custom.imapPort).toBe(993);
    });

    it("extractEmailAddress extracts clean addresses from raw strings with names", () => {
      expect(extractEmailAddress("John Doe <john.doe@company.com>")).toBe("john.doe@company.com");
      expect(extractEmailAddress("  recruiting@stripe.com  ")).toBe("recruiting@stripe.com");
      expect(extractEmailAddress("HR Team <HR@COMPANY.IO>")).toBe("hr@company.io");
    });

    it("matchRecruiterReply matches incoming emails by In-Reply-To thread ID", () => {
      const app = {
        id: "app-1",
        hrEmail: "jobs@stripe.com",
        emailThreadId: "msg-stripe-12345@routine.local",
        companyName: "Stripe",
      };
      const candidateEmail = "candidate@gmail.com";

      const incoming = {
        from: "Recruiter Alice <alice.recruiter@stripe.com>",
        inReplyTo: "<msg-stripe-12345@routine.local>",
        subject: "Re: Application for Software Engineer",
      };

      expect(matchRecruiterReply(incoming, app, candidateEmail)).toBe(true);
    });

    it("matchRecruiterReply matches incoming emails by References header (array or string)", () => {
      const app = {
        id: "app-2",
        hrEmail: "careers@databricks.com",
        emailThreadId: "msg-databricks-7788@routine.local",
        companyName: "Databricks",
      };
      const candidateEmail = "candidate@gmail.com";

      // Array references
      expect(
        matchRecruiterReply(
          {
            from: "Databricks Talent <talent@databricks.com>",
            references: ["<parent-id@mail.com>", "<msg-databricks-7788@routine.local>"],
          },
          app,
          candidateEmail
        )
      ).toBe(true);

      // String references
      expect(
        matchRecruiterReply(
          {
            from: "talent@databricks.com",
            references: "<parent-id@mail.com> <msg-databricks-7788@routine.local>",
          },
          app,
          candidateEmail
        )
      ).toBe(true);
    });

    it("matchRecruiterReply matches incoming emails by hrEmail address even without thread headers", () => {
      const app = {
        id: "app-3",
        hrEmail: "talent-acquisition@epam.com",
        emailThreadId: "msg-epam-5566@routine.local",
        companyName: "EPAM",
      };
      const candidateEmail = "candidate@gmail.com";

      // Direct email from HR email address
      expect(
        matchRecruiterReply(
          {
            from: "EPAM Recruitment Team <talent-acquisition@epam.com>",
            subject: "Interview Invitation: Lead Full-Stack Developer",
          },
          app,
          candidateEmail
        )
      ).toBe(true);
    });

    it("matchRecruiterReply ignores candidate's own sent emails or self-tests", () => {
      const app = {
        id: "app-4",
        hrEmail: "candidate@gmail.com", // in case user tested with their own email
        emailThreadId: "msg-self-9999",
        companyName: "Test Company",
      };
      const candidateEmail = "candidate@gmail.com";

      // Email sent from candidate's own address must NOT trigger a false recruiter reply
      expect(
        matchRecruiterReply(
          {
            from: "Candidate Name <candidate@gmail.com>",
            inReplyTo: "msg-self-9999",
            subject: "Re: Job Application",
          },
          app,
          candidateEmail
        )
      ).toBe(false);
    });

    it("matchRecruiterReply rejects unrelated stranger emails", () => {
      const app = {
        id: "app-5",
        hrEmail: "hr@uber.com",
        emailThreadId: "msg-uber-3322",
        companyName: "Uber",
      };
      const candidateEmail = "candidate@gmail.com";

      expect(
        matchRecruiterReply(
          {
            from: "newsletter@medium.com",
            subject: "Daily digest for you",
          },
          app,
          candidateEmail
        )
      ).toBe(false);
    });
  });
