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
  LOCATION_ELIGIBILITY_FILTERS,
  LOCATION_ELIGIBILITY_LABELS,
  type LocationEligibilityFilter,
  matchesLocationFilter,
} from "../src/lib/domain/jobs.ts";
import {
  isEngineeringRole,
  classifyJobLocation,
  scoreLiveJobPriority,
  compareLiveJobsPriority,
  formatRelativeJobTime,
} from "../src/lib/domain/live-jobs.ts";
import { encryptSecret, decryptSecret } from "../src/lib/crypto.ts";
import {
  getEmailProviderPreset,
  matchRecruiterReply,
  extractEmailAddress,
} from "../src/lib/domain/email-config.ts";
import { generatePdfFromText } from "../src/lib/pdf-generator.ts";
import { calculateAtsMatch, extractTaxonomySkills } from "../src/lib/domain/ats-matcher.ts";
import { inferCompanyCategoryFromMeta, stripHtmlTags } from "../src/server/services/live-job-fetchers.ts";
import { buildFallbackEmail } from "../src/server/ai/jobs.ts";
import { extractSkillsFromText } from "../src/server/services/jobs.ts";
import { CURATED_COMPANIES, getRoleForExperience } from "../src/server/services/job-scraper.ts";
import { computeEnabledModules, type LogMap, type Recurrence, type TaskDef, type TaskVersion } from "../src/lib/domain/types.ts";
import {
  stripGutenbergBoilerplate,
  splitBookIntoChapters,
  splitChapterIntoHalves,
} from "../src/server/services/novel-reader.ts";

const ver = (o: Partial<TaskVersion> = {}): TaskVersion => ({
  effectiveFrom: "2026-11-01", isMandatory: true, completionType: "BOOLEAN", target: 1, unit: null,
  recurrence: "DAILY" as Recurrence, weekdays: [], ...o,
});
const task = (id: string, o: Partial<TaskDef> = {}, v: Partial<TaskVersion> = {}): TaskDef => ({
  id, title: id, description: null, category: "FITNESS", personalDevType: null, sortOrder: 0, startDate: "2026-11-01", archivedOn: null,
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

  describe("Parent Location & India Eligibility Filters", () => {
    const indiaHubCompany = {
      name: "Razorpay",
      category: "STARTUP",
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: false,
      offersRelocation: false,
    };

    const remoteIndiaCompany = {
      name: "GitLab",
      category: "FOREIGN",
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    };

    const relocationCompany = {
      name: "Booking.com",
      category: "FOREIGN",
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: false,
      offersRelocation: true,
    };

    const hybridIndiaCompany = {
      name: "Microsoft India",
      category: "BIG_MNC",
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: true,
    };

    const nonIndiaCompany = {
      name: "US Local Only Co",
      category: "STARTUP",
      hiresFromIndia: false,
      isIndiaBased: false,
      offersRemoteIndia: false,
      offersRelocation: false,
    };

    it("matches ALL_INDIA_ELIGIBLE if company has at least one valid India hiring mode", () => {
      expect(matchesLocationFilter(indiaHubCompany, "ALL_INDIA_ELIGIBLE")).toBe(true);
      expect(matchesLocationFilter(remoteIndiaCompany, "ALL_INDIA_ELIGIBLE")).toBe(true);
      expect(matchesLocationFilter(relocationCompany, "ALL_INDIA_ELIGIBLE")).toBe(true);
      expect(matchesLocationFilter(hybridIndiaCompany, "ALL_INDIA_ELIGIBLE")).toBe(true);
      expect(matchesLocationFilter(nonIndiaCompany, "ALL_INDIA_ELIGIBLE")).toBe(false);
      expect(matchesLocationFilter(null, "ALL_INDIA_ELIGIBLE")).toBe(false);
    });

    it("matches INDIA_ONLY strictly when isIndiaBased is true", () => {
      expect(matchesLocationFilter(indiaHubCompany, "INDIA_ONLY")).toBe(true);
      expect(matchesLocationFilter(hybridIndiaCompany, "INDIA_ONLY")).toBe(true);
      expect(matchesLocationFilter(remoteIndiaCompany, "INDIA_ONLY")).toBe(false);
      expect(matchesLocationFilter(relocationCompany, "INDIA_ONLY")).toBe(false);
      expect(matchesLocationFilter(nonIndiaCompany, "INDIA_ONLY")).toBe(false);
    });

    it("matches REMOTE_INDIA strictly when offersRemoteIndia is true", () => {
      expect(matchesLocationFilter(remoteIndiaCompany, "REMOTE_INDIA")).toBe(true);
      expect(matchesLocationFilter(hybridIndiaCompany, "REMOTE_INDIA")).toBe(true);
      expect(matchesLocationFilter(indiaHubCompany, "REMOTE_INDIA")).toBe(false);
      expect(matchesLocationFilter(relocationCompany, "REMOTE_INDIA")).toBe(false);
      expect(matchesLocationFilter(nonIndiaCompany, "REMOTE_INDIA")).toBe(false);
    });

    it("matches RELOCATION strictly when offersRelocation is true", () => {
      expect(matchesLocationFilter(relocationCompany, "RELOCATION")).toBe(true);
      expect(matchesLocationFilter(hybridIndiaCompany, "RELOCATION")).toBe(true);
      expect(matchesLocationFilter(indiaHubCompany, "RELOCATION")).toBe(false);
      expect(matchesLocationFilter(remoteIndiaCompany, "RELOCATION")).toBe(false);
      expect(matchesLocationFilter(nonIndiaCompany, "RELOCATION")).toBe(false);
    });

    it("rejects companies where hiresFromIndia is false regardless of other flags", () => {
      const spoofedCompany = {
        name: "Spoofed",
        hiresFromIndia: false,
        isIndiaBased: true,
        offersRemoteIndia: true,
        offersRelocation: true,
      };
      expect(matchesLocationFilter(spoofedCompany, "ALL_INDIA_ELIGIBLE")).toBe(false);
      expect(matchesLocationFilter(spoofedCompany, "INDIA_ONLY")).toBe(false);
      expect(matchesLocationFilter(spoofedCompany, "REMOTE_INDIA")).toBe(false);
      expect(matchesLocationFilter(spoofedCompany, "RELOCATION")).toBe(false);
    });

    it("correctly combines Parent Location Filter and Sub-Filter Categories via logical AND", () => {
      const companies = [
        indiaHubCompany, // STARTUP, India Hub
        remoteIndiaCompany, // FOREIGN, Remote India
        relocationCompany, // FOREIGN, Relocation
        hybridIndiaCompany, // BIG_MNC, All three
      ];

      // Case 1: India Only AND STARTUP
      const result1 = companies.filter(
        (c) => matchesLocationFilter(c, "INDIA_ONLY") && c.category === "STARTUP"
      );
      expect(result1.map((c) => c.name)).toEqual(["Razorpay"]);

      // Case 2: Remote India AND FOREIGN
      const result2 = companies.filter(
        (c) => matchesLocationFilter(c, "REMOTE_INDIA") && c.category === "FOREIGN"
      );
      expect(result2.map((c) => c.name)).toEqual(["GitLab"]);

      // Case 3: Relocation AND FOREIGN
      const result3 = companies.filter(
        (c) => matchesLocationFilter(c, "RELOCATION") && c.category === "FOREIGN"
      );
      expect(result3.map((c) => c.name)).toEqual(["Booking.com"]);

      // Case 4: India Only AND FOREIGN (No match)
      const result4 = companies.filter(
        (c) => matchesLocationFilter(c, "INDIA_ONLY") && c.category === "FOREIGN"
      );
      expect(result4.length).toBe(0);
    });

    it("verifies 100% of CURATED_COMPANIES comply with India eligibility", () => {
      expect(CURATED_COMPANIES.length).toBeGreaterThanOrEqual(35);
      for (const company of CURATED_COMPANIES) {
        expect(company.hiresFromIndia).toBe(true);
        const hasValidMode =
          Boolean(company.isIndiaBased) ||
          Boolean(company.offersRemoteIndia) ||
          Boolean(company.offersRelocation);
        expect(hasValidMode).toBe(true);
        expect(matchesLocationFilter(company, "ALL_INDIA_ELIGIBLE")).toBe(true);
      }
    });
  });

  describe("Real-time Live Job Engine & India Priority Logic", () => {
    describe("isEngineeringRole filtering", () => {
      it("accurately identifies engineering, developer, and technical roles", () => {
        expect(isEngineeringRole("Software Engineer")).toBe(true);
        expect(isEngineeringRole("Senior Full-Stack Developer (React / Node.js)")).toBe(true);
        expect(isEngineeringRole("Backend SDE-2 - Core Payment Architecture")).toBe(true);
        expect(isEngineeringRole("DevOps & Cloud Platform Engineer")).toBe(true);
        expect(isEngineeringRole("Site Reliability Engineer (SRE)")).toBe(true);
        expect(isEngineeringRole("Mobile Application Developer - Android / iOS")).toBe(true);
        expect(isEngineeringRole("Associate Software Development Engineer")).toBe(true);
        expect(isEngineeringRole("Staff Distributed Systems Architect")).toBe(true);
        expect(isEngineeringRole("Quality Assurance / SDET Automation Engineer")).toBe(true);
        expect(isEngineeringRole("Data Platform Engineer - Kafka & Spark")).toBe(true);
      });

      it("filters out non-engineering roles (Sales, HR, Marketing, Legal, Facilities)", () => {
        expect(isEngineeringRole("Account Executive - Enterprise Sales")).toBe(false);
        expect(isEngineeringRole("Business Development Representative (BDR)")).toBe(false);
        expect(isEngineeringRole("Talent Acquisition Specialist / Recruiter")).toBe(false);
        expect(isEngineeringRole("People Operations Generalist")).toBe(false);
        expect(isEngineeringRole("Legal Counsel & Compliance Manager")).toBe(false);
        expect(isEngineeringRole("Office Facilities & Workplace Coordinator")).toBe(false);
        expect(isEngineeringRole("Content Writer & Social Media Marketer")).toBe(false);
        expect(isEngineeringRole("Customer Success Specialist")).toBe(false);
        expect(isEngineeringRole("Senior Financial Analyst")).toBe(false);
      });
    });

    describe("classifyJobLocation", () => {
      it("identifies active Indian hubs (Bengaluru, Pune, Hyderabad, Mumbai, Delhi NCR, etc.)", () => {
        const bangalore = classifyJobLocation("Bengaluru, Karnataka, India");
        expect(bangalore.isIndiaBased).toBe(true);
        expect(bangalore.isIndiaEligible).toBe(true);
        expect(bangalore.cleanLocation).toContain("Bengaluru");

        const pune = classifyJobLocation("Pune, Maharashtra");
        expect(pune.isIndiaBased).toBe(true);
        expect(pune.isIndiaEligible).toBe(true);
        expect(pune.cleanLocation).toContain("Pune");

        const hyderabad = classifyJobLocation("Hyderabad, Telangana, India");
        expect(hyderabad.isIndiaBased).toBe(true);
        expect(hyderabad.isIndiaEligible).toBe(true);

        const mumbai = classifyJobLocation("Mumbai, India");
        expect(mumbai.isIndiaBased).toBe(true);
        expect(mumbai.isIndiaEligible).toBe(true);

        const gurgaon = classifyJobLocation("Gurugram / Delhi NCR, India");
        expect(gurgaon.isIndiaBased).toBe(true);
        expect(gurgaon.isIndiaEligible).toBe(true);
      });

      it("identifies Remote India and Global/Worldwide Remote roles", () => {
        const remoteIndia = classifyJobLocation("Remote - India");
        expect(remoteIndia.offersRemoteIndia).toBe(true);
        expect(remoteIndia.isIndiaEligible).toBe(true);

        const worldwide = classifyJobLocation("Worldwide (Remote)");
        expect(worldwide.offersRemoteIndia).toBe(true);
        expect(worldwide.isIndiaEligible).toBe(true);

        const apac = classifyJobLocation("APAC Remote");
        expect(apac.offersRemoteIndia).toBe(true);
        expect(apac.isIndiaEligible).toBe(true);

        const anywhere = classifyJobLocation("Work from Anywhere");
        expect(anywhere.offersRemoteIndia).toBe(true);
        expect(anywhere.isIndiaEligible).toBe(true);
      });

      it("identifies Relocation and Visa Sponsorship roles", () => {
        const amsterdamReloc = classifyJobLocation(
          "Amsterdam, Netherlands",
          "Senior Software Engineer (Visa Sponsorship & Relocation Provided)"
        );
        expect(amsterdamReloc.offersRelocation).toBe(true);
        expect(amsterdamReloc.isIndiaEligible).toBe(true);

        const londonReloc = classifyJobLocation("London (Relocation Assistance)");
        expect(londonReloc.offersRelocation).toBe(true);
        expect(londonReloc.isIndiaEligible).toBe(true);
      });

      it("strictly drops roles restricted to non-India regions without relocation sponsorship", () => {
        const usOnly = classifyJobLocation("San Francisco, CA (US Only)");
        expect(usOnly.isIndiaEligible).toBe(false);

        const remoteUs = classifyJobLocation("Remote - US");
        expect(remoteUs.isIndiaEligible).toBe(false);

        const ukOnly = classifyJobLocation("London, UK (UK Only)");
        expect(ukOnly.isIndiaEligible).toBe(false);

        const canadaOnly = classifyJobLocation("Toronto (Canada Only)");
        expect(canadaOnly.isIndiaEligible).toBe(false);
      });
    });

    describe("scoreLiveJobPriority and priority sorting", () => {
      it("ranks Indian Hub jobs highest, followed by Remote-India, then Relocation", () => {
        const indiaHubJob = {
          isIndiaBased: true,
          offersRemoteIndia: false,
          offersRelocation: false,
          postedAt: new Date(),
        };
        const remoteJob = {
          isIndiaBased: false,
          offersRemoteIndia: true,
          offersRelocation: false,
          postedAt: new Date(),
        };
        const relocationJob = {
          isIndiaBased: false,
          offersRemoteIndia: false,
          offersRelocation: true,
          postedAt: new Date(),
        };

        const scoreIndia = scoreLiveJobPriority(indiaHubJob);
        const scoreRemote = scoreLiveJobPriority(remoteJob);
        const scoreReloc = scoreLiveJobPriority(relocationJob);

        expect(scoreIndia).toBeGreaterThan(scoreRemote);
        expect(scoreRemote).toBeGreaterThan(scoreReloc);
        expect(scoreReloc).toBeGreaterThan(0);

        // Comparator verification
        expect(compareLiveJobsPriority(indiaHubJob, remoteJob)).toBeLessThan(0); // indiaHubJob ranks before remoteJob
        expect(compareLiveJobsPriority(remoteJob, relocationJob)).toBeLessThan(0);
      });

      it("sorts within the same tier by recency", () => {
        const olderIndiaJob = {
          isIndiaBased: true,
          offersRemoteIndia: false,
          offersRelocation: false,
          postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days old
        };
        const newerIndiaJob = {
          isIndiaBased: true,
          offersRemoteIndia: false,
          offersRelocation: false,
          postedAt: new Date(), // fresh
        };

        expect(scoreLiveJobPriority(newerIndiaJob)).toBeGreaterThan(scoreLiveJobPriority(olderIndiaJob));
        expect(compareLiveJobsPriority(newerIndiaJob, olderIndiaJob)).toBeLessThan(0);
      });
    });

    describe("formatRelativeJobTime", () => {
      it("formats relative timestamps correctly", () => {
        const now = new Date("2026-11-22T10:00:00Z");
        expect(formatRelativeJobTime(new Date("2026-11-22T09:59:00Z"), now)).toBe("Just now");
        expect(formatRelativeJobTime(new Date("2026-11-22T08:00:00Z"), now)).toBe("2h ago");
        expect(formatRelativeJobTime(new Date("2026-11-21T10:00:00Z"), now)).toBe("1d ago");
        expect(formatRelativeJobTime(new Date("2026-11-18T10:00:00Z"), now)).toBe("4d ago");
        expect(formatRelativeJobTime(null, now)).toBe("Live");
      });
    });
  });

  describe("Native PDF Generator & Resume Attachments", () => {
    it("generates a valid, compliant standard PDF 1.4 buffer with correct header and trailer", () => {
      const title = "Mohd_Arslan_SDR";
      const content = `Senior Full-Stack Engineer with 4 years experience building scalable web applications.
Skills: TypeScript, Next.js, Node.js, PostgreSQL, Docker, AWS.
Experience:
- Architected enterprise multi-tenant routine systems.
- Optimized query latency by 45% using Postgres indexing.`;

      const pdfBuf = generatePdfFromText(title, content);

      expect(Buffer.isBuffer(pdfBuf)).toBe(true);
      expect(pdfBuf.length).toBeGreaterThan(200);

      const latinStr = pdfBuf.toString("latin1");
      expect(latinStr.startsWith("%PDF-1.4\n")).toBe(true);
      expect(latinStr).toContain("/Type /Catalog");
      expect(latinStr).toContain("/Type /Pages");
      expect(latinStr).toContain("/Type /Page");
      expect(latinStr).toContain("/BaseFont /Helvetica");
      expect(latinStr).toContain("/BaseFont /Helvetica-Bold");
      expect(latinStr).toContain("trailer\n");
      expect(latinStr.trimEnd().endsWith("%%EOF")).toBe(true);
    });

    it("handles long multi-page resume content cleanly", () => {
      const longLines = Array.from({ length: 120 }, (_, i) => `Project experience item #${i + 1}: Implemented high-throughput event processing pipelines.`);
      const content = longLines.join("\n");

      const pdfBuf = generatePdfFromText("Detailed Resume", content);
      const latinStr = pdfBuf.toString("latin1");

      // Verify multiple pages were generated
      expect(latinStr).toContain("/Count 3"); // 120 lines / 48 per page = 3 pages
      expect(latinStr).toContain("Page 1 of 3");
      expect(latinStr).toContain("Page 2 of 3");
      expect(latinStr).toContain("Page 3 of 3");
      expect(latinStr.trimEnd().endsWith("%%EOF")).toBe(true);
    });

    it("sanitizes quotes, parentheses and special unicode characters without corrupting PDF stream", () => {
      const trickyContent = `Candidate: “John (Jack) O'Connor” & Co.
Special symbols: • Bullet 1 — Em dash – En dash … Ellipsis \\ Backslash`;

      const pdfBuf = generatePdfFromText("Special Chars", trickyContent);
      const latinStr = pdfBuf.toString("latin1");

      expect(latinStr.startsWith("%PDF-1.4\n")).toBe(true);
      expect(latinStr.trimEnd().endsWith("%%EOF")).toBe(true);
      // Ensure parentheses were escaped
      expect(latinStr).toContain("\\(Jack\\)");
    });
  });

  describe("Resume ATS-to-JD Matcher & Dynamic IT Categorization", () => {
    const javaBackendResume = `
      Senior Backend Engineer with 4 years of experience building high-throughput microservices.
      Primary stack: Java 17, Spring Boot, PostgreSQL, Kafka, Redis, Docker, REST APIs, Microservices.
      Architected scalable distributed payment services and optimized database queries.
    `;
    const javaSkills = ["Java", "Spring Boot", "PostgreSQL", "Kafka", "Redis", "Docker", "REST APIs", "Microservices"];

    it("evaluates a High Match scenario for closely aligned technical JD and experience", () => {
      const jd = `
        We are hiring an SDE II - Java Backend Engineer (3-5 Years).
        Requirements: Core Java, Spring Boot, PostgreSQL, Redis, REST APIs, and microservices architecture.
      `;
      const result = calculateAtsMatch(
        javaBackendResume,
        javaSkills,
        "Software Development Engineer II - Java Backend (3-5 Yrs)",
        jd,
        "MID"
      );

      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.probabilityLabel).toBe("High");
      expect(result.experienceFit).toBe("STRONG");
      expect(result.matchedSkills).toContain("Java");
      expect(result.matchedSkills).toContain("Spring Boot");
      expect(result.matchedSkills).toContain("PostgreSQL");
      expect(result.summary).toContain("Strong match");
    });

    it("evaluates a Moderate Match scenario when core skills partially overlap or experience is adjacent", () => {
      const jd = `
        Full-Stack Engineer (1-3 Years).
        Must have: Java, TypeScript, React, PostgreSQL, and AWS.
      `;
      const result = calculateAtsMatch(
        javaBackendResume,
        javaSkills,
        "Full-Stack Software Engineer (1-3 Yrs)",
        jd,
        "MID" // Candidate is MID, role is JUNIOR (1 tier diff)
      );

      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(80);
      expect(result.probabilityLabel).toBe("Moderate");
      expect(result.experienceFit).toBe("PARTIAL");
      expect(result.matchedSkills).toContain("Java");
      expect(result.missingSkills).toContain("React");
    });

    it("evaluates a Stretch scenario with low skill overlap and large experience gap", () => {
      const jd = `
        Principal Staff iOS Engineer (8+ years).
        Must have: Swift, Objective-C, CoreData, Metal, and high-performance mobile architectures.
      `;
      const result = calculateAtsMatch(
        javaBackendResume,
        javaSkills,
        "Staff Principal iOS Mobile Architect (5+ Years Senior)",
        jd,
        "FRESHER" // Candidate is FRESHER applying to SENIOR
      );

      expect(result.score).toBeLessThan(50);
      expect(result.probabilityLabel).toBe("Stretch");
      expect(result.experienceFit).toBe("STRETCH");
      expect(result.experienceScore).toBeLessThanOrEqual(4);
    });

    it("penalizes FRESHER candidates applying for SENIOR roles heavily", () => {
      const fresherResult = calculateAtsMatch(
        "Fresher Graduate with Java knowledge",
        ["Java"],
        "Senior Lead Software Engineer (5+ Years)",
        "Senior role needing 5+ years Java and leadership",
        "FRESHER"
      );
      const seniorResult = calculateAtsMatch(
        "Senior Staff Engineer with 8 years Java",
        ["Java"],
        "Senior Lead Software Engineer (5+ Years)",
        "Senior role needing 5+ years Java and leadership",
        "SENIOR"
      );

      expect(fresherResult.experienceScore).toBeLessThan(seniorResult.experienceScore);
      expect(fresherResult.experienceFit).toBe("STRETCH");
      expect(seniorResult.experienceFit).toBe("STRONG");
    });

    it("infers dynamic company categories for open-aggregator IT listings correctly", () => {
      expect(inferCompanyCategoryFromMeta("PixelCraft Studio", "Digital agency and consulting services for web clients")).toBe("SMALL_SCALE");
      expect(inferCompanyCategoryFromMeta("Acme Consulting", "IT services and software contracting")).toBe("SMALL_SCALE");
      expect(inferCompanyCategoryFromMeta("Persistent Technologies", "Global multinational IT services and enterprise solutions")).toBe("MID_MNC");
      expect(inferCompanyCategoryFromMeta("PayZap Technologies", "YC backed fintech startup scaling rapid consumer payments")).toBe("STARTUP");
      expect(inferCompanyCategoryFromMeta("CloudScale App", "B2B SaaS product for developers")).toBe("STARTUP");
    });

    it("strips HTML tags and decodes entities cleanly from job descriptions", () => {
      const html = `<div class="job-desc"><p>We are hiring a <strong>Senior Engineer</strong> &amp; architect.</p><script>alert('xss')</script><span>Requirements: Java &lt; 21 &gt; 11</span></div>`;
      const stripped = stripHtmlTags(html);

      expect(stripped).not.toContain("<p>");
      expect(stripped).not.toContain("<script>");
      expect(stripped).not.toContain("alert");
      expect(stripped).toContain("Senior Engineer");
      expect(stripped).toContain("&");
      expect(stripped).toContain("Java < 21 > 11");
    });
  });

  describe("Personal Development Task Integration & Gating Rules", () => {
    it("evaluates dynamic sidebar visibility flags (enabledModules) based on active vs archived personalDevType tasks", () => {
      // No personal dev tasks -> all disabled
      expect(computeEnabledModules([])).toEqual({
        jobs: false,
        duolingo: false,
        novels: false,
        blogs: false,
      });

      // Active tasks enable their corresponding modules
      const activeTasks = [
        { personalDevType: "JOB_APPLY", archivedOn: null },
        { personalDevType: "NOVEL_READING", archivedOn: null },
      ];
      expect(computeEnabledModules(activeTasks)).toEqual({
        jobs: true,
        duolingo: false,
        novels: true,
        blogs: false,
      });

      // Archived tasks do NOT enable modules
      const mixedTasks = [
        { personalDevType: "JOB_APPLY", archivedOn: "2026-11-20" },
        { personalDevType: "DUOLINGO", archivedOn: null },
        { personalDevType: "BLOG_WRITING", archivedOn: null },
      ];
      expect(computeEnabledModules(mixedTasks)).toEqual({
        jobs: false,
        duolingo: true,
        novels: false,
        blogs: true,
      });
    });

    it("evaluates Job Apply 10-jobs/day completion threshold (9 = incomplete, 10 = complete)", () => {
      const target = 10;
      const checkCompletion = (appliedCount: number) => appliedCount >= target;

      expect(checkCompletion(0)).toBe(false);
      expect(checkCompletion(4)).toBe(false);
      expect(checkCompletion(9)).toBe(false);
      expect(checkCompletion(10)).toBe(true);
      expect(checkCompletion(15)).toBe(true);
    });

    it("evaluates Duolingo streak comparison (currentStreak > previousDayStreak = complete, equal/lower = incomplete)", () => {
      const isStreakProgressValid = (fetchedStreak: number, previousDayStreak: number) =>
        fetchedStreak > previousDayStreak && fetchedStreak > 0;

      // Unchanged streak (no lesson completed today)
      expect(isStreakProgressValid(12, 12)).toBe(false);
      // Decreased streak (streak freeze or reset)
      expect(isStreakProgressValid(0, 5)).toBe(false);
      // Increased streak (lesson completed today)
      expect(isStreakProgressValid(13, 12)).toBe(true);
      // First day connecting with positive streak
      expect(isStreakProgressValid(1, 0)).toBe(true);
    });

    it("evaluates Novel half-chapter quiz pass/fail threshold (2/5 = fail, 3/5 = pass)", () => {
      const isQuizPassed = (score: number, total: number = 5) => score >= 3 && score <= total;

      expect(isQuizPassed(0)).toBe(false);
      expect(isQuizPassed(1)).toBe(false);
      expect(isQuizPassed(2)).toBe(false);
      expect(isQuizPassed(3)).toBe(true);
      expect(isQuizPassed(4)).toBe(true);
      expect(isQuizPassed(5)).toBe(true);
    });

    it("splits book text and half-chapters deterministically", () => {
      const mockRawText = `
*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***

Chapter 1: The First Departure

The morning light broke across the hills. The carriage had arrived early.
Everyone gathered in the courtyard with luggage prepared.

Chapter 2: The Open Road

The wheels turned rhythmically upon the cobblestones. The journey began in earnest.
The traveler looked back one final time before turning toward the horizon.

*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***
`;

      const stripped = stripGutenbergBoilerplate(mockRawText);
      expect(stripped).not.toContain("START OF THE PROJECT GUTENBERG");
      expect(stripped).not.toContain("END OF THE PROJECT GUTENBERG");
      expect(stripped).toContain("Chapter 1: The First Departure");

      const chapters = splitBookIntoChapters(stripped);
      expect(chapters.length).toBe(2);
      expect(chapters[0].title).toContain("Chapter 1");
      expect(chapters[1].title).toContain("Chapter 2");

      const half1 = splitChapterIntoHalves(chapters[0], 2, 1);
      const half2 = splitChapterIntoHalves(chapters[0], 2, 2);

      expect(half1.half).toBe(1);
      expect(half2.half).toBe(2);
      expect(half1.title).toContain("Part 1 of 2");
      expect(half2.title).toContain("Part 2 of 2");
      expect(half1.content.length).toBeGreaterThan(0);
      expect(half2.content.length).toBeGreaterThan(0);
    });
  });
