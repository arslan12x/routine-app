import { withUserDb } from "@/lib/db";
import { todayIn, addDays } from "@/lib/domain/dates";
import { isDone, logKey, scheduledOn, versionOn } from "@/lib/domain/schedule";
import { loadTasks, d2s } from "@/server/repositories/tasks";
import { ApiError } from "@/lib/api";

export interface TaskLearningContext {
  taskId: string;
  completedDays: number;
  streak: number;
  currentDay: number;
  currentModule: number;
  stage: string;
  badgeLabel: string;
  summary: string;
}

export function computeTaskStreakAndCompletedDays(
  taskVersions: Parameters<typeof scheduledOn>[0],
  logs: Map<string, number>,
  today: string
): { completedDays: number; streak: number } {
  // Collect all unique dates with logged values for this task
  const completedDateSet = new Set<string>();

  for (const [key, value] of logs.entries()) {
    const [taskId, dateStr] = key.split("|");
    if (taskId !== taskVersions.id) continue;
    const v = versionOn(taskVersions, dateStr);
    if (v && isDone(v, value)) {
      completedDateSet.add(dateStr);
    }
  }

  const completedDays = completedDateSet.size;

  // Calculate consecutive streak up to today
  let streak = 0;
  let checkDate = today;

  // Check today first
  const todayScheduled = scheduledOn(taskVersions, today);
  const doneToday = completedDateSet.has(today);

  if (doneToday) {
    streak++;
    checkDate = addDays(checkDate, -1);
  } else if (todayScheduled) {
    // If scheduled today but not yet done, streak can still be maintained by yesterday
    checkDate = addDays(checkDate, -1);
  } else {
    // Today not scheduled, start looking from yesterday
    checkDate = addDays(checkDate, -1);
  }

  // Count backwards consecutively
  while (checkDate >= taskVersions.startDate) {
    const scheduled = scheduledOn(taskVersions, checkDate);
    if (!scheduled) {
      // Neutral day, step back without breaking
      checkDate = addDays(checkDate, -1);
      continue;
    }
    if (completedDateSet.has(checkDate)) {
      streak++;
      checkDate = addDays(checkDate, -1);
    } else {
      break;
    }
  }

  return { completedDays, streak };
}

export async function getTaskLearningContext(userId: string, taskId: string): Promise<TaskLearningContext> {
  const tasks = await loadTasks(userId);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new ApiError(404, "NOT_FOUND", "Task not found");
  }

  // Load task logs
  const rawLogs = await withUserDb(userId, (tx) =>
    tx.taskLog.findMany({
      where: { userId, taskId },
      select: { localDate: true, value: true },
    })
  );

  const logMap = new Map<string, number>();
  for (const r of rawLogs) {
    logMap.set(logKey(taskId, d2s(r.localDate)), r.value);
  }

  // Get user's current date (fallback to UTC today)
  const today = todayIn("UTC");
  const { completedDays, streak } = computeTaskStreakAndCompletedDays(task, logMap, today);

  const currentDay = completedDays === 0 ? 1 : completedDays + 1;
  const currentModule = Math.floor(completedDays / 5) + 1;

  const stage = completedDays === 0
    ? "Day 1 - Onboarding Course (Absolute Zero / Foundations)"
    : `Day ${currentDay} (Module ${currentModule})`;

  const badgeLabel = completedDays === 0
    ? "Day 1 Onboarding"
    : `Based on ${completedDays} completed day${completedDays === 1 ? "" : "s"}`;

  const summary = [
    `DETERMINISTIC LEARNER MEMORY & CONTEXT:`,
    `- Total verified completed days for this task: ${completedDays}`,
    `- Consecutive learning streak: ${streak} day(s)`,
    `- Current curriculum stage: ${stage}`,
    completedDays === 0
      ? `- Learning status: Day 1 Onboarding. The learner is beginning at absolute zero. Introduce foundational concepts step-by-step with zero assumptions of prior knowledge.`
      : `- Learning status: Learner has completed ${completedDays} days. Deliver syllabus content strictly targeting Day ${currentDay} (Module ${currentModule}). Build directly on prior foundations.`,
  ].join("\n");

  return {
    taskId,
    completedDays,
    streak,
    currentDay,
    currentModule,
    stage,
    badgeLabel,
    summary,
  };
}
