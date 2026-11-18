import { isDone, scheduledOn } from "@/lib/domain/schedule";
import type { LogMap, TaskDef } from "@/lib/domain/types";

export interface BadgeInfo {
  badgeType: string;
  label: string;
  description: string;
  icon: "Flame" | "Trophy" | "Brain" | "GraduationCap" | "CheckCircle2" | "ShieldCheck" | "Zap";
}

export const BADGE_DEFINITIONS: Record<string, BadgeInfo> = {
  STREAK_7: {
    badgeType: "STREAK_7",
    label: "7-Day Streak",
    description: "Maintained a consistent habit streak for 7 consecutive days",
    icon: "Flame",
  },
  STREAK_30: {
    badgeType: "STREAK_30",
    label: "30-Day Master",
    description: "Maintained a consistent habit streak for 30 consecutive days",
    icon: "Trophy",
  },
  AI_SESSIONS_10: {
    badgeType: "AI_SESSIONS_10",
    label: "AI Scholar",
    description: "Completed 10 AI-guided learning and study sessions",
    icon: "Brain",
  },
  AI_SESSIONS_100: {
    badgeType: "AI_SESSIONS_100",
    label: "AI Century",
    description: "Completed 100 AI-guided learning and study sessions",
    icon: "GraduationCap",
  },
  TASK_CENTURY: {
    badgeType: "TASK_CENTURY",
    label: "Centurion",
    description: "Completed 100 routine tasks",
    icon: "CheckCircle2",
  },
  PERFECT_WEEK: {
    badgeType: "PERFECT_WEEK",
    label: "Flawless Week",
    description: "Achieved 100% routine consistency across active days",
    icon: "ShieldCheck",
  },
  FIRST_STEP: {
    badgeType: "FIRST_STEP",
    label: "First Step",
    description: "Completed your first habit in Routine Tracker",
    icon: "Zap",
  },
};

export interface UserMetrics {
  tasks: TaskDef[];
  logs: LogMap;
  currentStreak: number;
  longestStreak: number;
  consistencyRate: number | null;
  successDays: number;
}

export function evaluateEligibleBadges(metrics: UserMetrics): string[] {
  const earned: string[] = [];
  const { tasks, logs, currentStreak, longestStreak, consistencyRate, successDays } = metrics;

  // Streak milestones
  const bestStreak = Math.max(currentStreak, longestStreak);
  if (bestStreak >= 7) earned.push("STREAK_7");
  if (bestStreak >= 30) earned.push("STREAK_30");

  // Consistency & Success days
  if (consistencyRate !== null && consistencyRate >= 1.0 && successDays >= 7) {
    earned.push("PERFECT_WEEK");
  }

  // Count completed tasks and AI sessions
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  let totalCompletions = 0;
  let aiCompletions = 0;

  for (const [key, value] of logs.entries()) {
    const sepIndex = key.includes("|") ? key.indexOf("|") : key.indexOf(":");
    if (sepIndex === -1) continue;
    const taskId = key.slice(0, sepIndex);
    const date = key.slice(sepIndex + 1);
    const task = taskMap.get(taskId);
    if (!task) continue;

    const version = scheduledOn(task, date);
    if (!version) continue;

    const done = isDone(version, value);
    if (done) {
      totalCompletions += 1;
      if (task.isAiGated) {
        aiCompletions += 1;
      }
    }
  }

  if (totalCompletions >= 1) earned.push("FIRST_STEP");
  if (totalCompletions >= 100) earned.push("TASK_CENTURY");
  if (aiCompletions >= 10) earned.push("AI_SESSIONS_10");
  if (aiCompletions >= 100) earned.push("AI_SESSIONS_100");

  return earned;
}
