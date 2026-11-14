import { withAiStudyDb, withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import type { TaskCreate, TaskPatch } from "@/lib/validation";
import { addDays, hourIn, longDate, todayIn, weekStart } from "@/lib/domain/dates";
import { shouldRejectStaleWrite } from "@/lib/domain/sync";
import { isDone, logKey, progressOf, scheduledOn, versionOn, weekDays } from "@/lib/domain/schedule";
import { computeStreaks } from "@/lib/domain/streaks";
import type { Category, CompletionType, Recurrence, StudySubject, TaskDef } from "@/lib/domain/types";
import { d2s, loadLogs, loadTasks, s2d } from "@/server/repositories/tasks";

export const BACKDATE_DAYS = 7;

export interface TaskView {
  id: string; title: string; description: string | null; category: Category;
  isAiGated: boolean; aiSubject: StudySubject | null; aiCourseName: string | null; aiCoursePrompt: string | null;
  isMandatory: boolean; completionType: CompletionType; target: number; unit: string | null;
  recurrence: Recurrence; weekdays: number[];
}
export interface DayItem extends TaskView { value: number; done: boolean; progress: number; weekSum: number | null }
export interface DayView {
  date: string; today: string; editable: boolean; greeting: string; longDate: string;
  hasTasks: boolean;
  streak: number; progressPct: number; completed: number; total: number;
  mandatory: DayItem[]; extra: DayItem[]; others: TaskView[];
}

const view = (t: TaskDef, v: NonNullable<ReturnType<typeof versionOn>>): TaskView => ({
  id: t.id, title: t.title, description: t.description, category: t.category, isMandatory: v.isMandatory,
  isAiGated: t.isAiGated, aiSubject: t.aiSubject, aiCourseName: t.aiCourseName, aiCoursePrompt: t.aiCoursePrompt,
  completionType: v.completionType, target: v.target, unit: v.unit, recurrence: v.recurrence, weekdays: v.weekdays,
});

function validateStudySettings(settings: {
  isAiGated: boolean;
  aiSubject: StudySubject | null;
  aiCourseName: string | null;
  aiCoursePrompt: string | null;
}) {
  if (settings.isAiGated && !settings.aiSubject) {
    throw new ApiError(400, "VALIDATION", "Choose a course for AI-guided completion");
  }
  if (!settings.isAiGated && settings.aiSubject) {
    throw new ApiError(400, "VALIDATION", "A course can only be set for an AI-guided task");
  }
  if (settings.isAiGated && settings.aiSubject === "CUSTOM" && (!settings.aiCourseName?.trim() || !settings.aiCoursePrompt?.trim())) {
    throw new ApiError(400, "VALIDATION", "Enter a course name and learning prompt for a custom study course");
  }
  if (settings.aiSubject !== "CUSTOM" && (settings.aiCourseName || settings.aiCoursePrompt)) {
    throw new ApiError(400, "VALIDATION", "Custom course details are only valid for a custom AI-guided course");
  }
}

function validateRules(m: { isMandatory: boolean; recurrence: Recurrence; weekdays: number[]; target: number }) {
  if (m.recurrence === "WEEKLY_TOTAL" && m.isMandatory) throw new ApiError(400, "VALIDATION", "Weekly-total tasks cannot be mandatory");
  if (m.recurrence === "WEEKDAYS" && m.weekdays.length === 0) throw new ApiError(400, "VALIDATION", "Pick at least one weekday");
  if (!(m.target > 0)) throw new ApiError(400, "VALIDATION", "Target must be positive");
}

export async function dayView(user: AppUser, date: string): Promise<DayView> {
  const today = todayIn(user.timezone);
  if (date > today) throw new ApiError(400, "FUTURE_DATE", "Cannot view future dates");
  const [tasks, logs] = await Promise.all([loadTasks(user.id), loadLogs(user.id)]);
  const mandatory: DayItem[] = [], extra: DayItem[] = [];
  const ws = weekStart(date, user.weekStartsOn);
  for (const t of tasks) {
    const v = scheduledOn(t, date);
    if (!v) continue;
    const value = logs.get(logKey(t.id, date)) ?? 0;
    const weekly = v.recurrence === "WEEKLY_TOTAL";
    const weekSum = weekly ? weekDays(ws).reduce((a, d) => a + (logs.get(logKey(t.id, d)) ?? 0), 0) : null;
    const item: DayItem = {
      ...view(t, v), value,
      done: weekly ? (weekSum ?? 0) >= v.target : isDone(v, value),
      progress: weekly ? Math.min(1, (weekSum ?? 0) / v.target) : progressOf(v, value),
      weekSum,
    };
    (v.isMandatory ? mandatory : extra).push(item);
  }
  const daily = [...mandatory, ...extra].filter((i) => i.recurrence !== "WEEKLY_TOTAL");
  const completed = daily.filter((i) => i.done).length;
  const progressPct = daily.length ? Math.round((daily.reduce((a, i) => a + i.progress, 0) / daily.length) * 100) : 0;
  const hour = hourIn(user.timezone);
  const others: TaskView[] = [];
  if (date === today) {
    for (const t of tasks) {
      if (t.archivedOn && t.archivedOn <= today) continue;
      if (scheduledOn(t, date)) continue;
      const v = versionOn(t, today) ?? t.versions[0];
      if (v) others.push(view(t, v));
    }
  }
  return {
    date, today, editable: date >= addDays(today, -BACKDATE_DAYS),
    greeting: hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening",
    longDate: longDate(date),
    hasTasks: tasks.length > 0,
    streak: computeStreaks(tasks, logs, today).current,
    progressPct, completed, total: daily.length, mandatory, extra, others,
  };
}

export async function listTasks(userId: string) {
  const tasks = await loadTasks(userId);
  return tasks.map((t) => ({ ...t, current: t.versions[t.versions.length - 1] }));
}

export async function createTask(user: AppUser, input: TaskCreate) {
  validateStudySettings({
    isAiGated: input.isAiGated,
    aiSubject: input.aiSubject ?? null,
    aiCourseName: input.aiCourseName ?? null,
    aiCoursePrompt: input.aiCoursePrompt ?? null,
  });
  const today = todayIn(user.timezone);
  const startDate = input.startDate ?? today;
  if (startDate < today) throw new ApiError(400, "VALIDATION", "Start date cannot be in the past");
  const target = input.completionType === "BOOLEAN" && input.recurrence !== "WEEKLY_TOTAL" ? 1 : input.target;
  const task = await withUserDb(user.id, async (tx) => {
    const agg = await tx.task.aggregate({ where: { userId: user.id }, _max: { sortOrder: true } });
    return tx.task.create({
      data: {
        userId: user.id, title: input.title, description: input.description ?? null, category: input.category,
        isAiGated: input.isAiGated, aiSubject: input.aiSubject ?? null,
        aiCourseName: input.aiSubject === "CUSTOM" ? input.aiCourseName ?? null : null,
        aiCoursePrompt: input.aiSubject === "CUSTOM" ? input.aiCoursePrompt ?? null : null,
        startDate: s2d(startDate), sortOrder: (agg._max.sortOrder ?? -1) + 1,
        versions: {
          create: {
            effectiveFrom: s2d(startDate), isMandatory: input.isMandatory, completionType: input.completionType,
            target, unit: input.unit ?? null, recurrence: input.recurrence,
            weekdays: input.recurrence === "WEEKDAYS" ? input.weekdays : [],
          },
        },
      },
    });
  });
  return { id: task.id };
}

/**
 * Cosmetic fields (title, description, category) change in place.
 * Result-affecting fields change as a NEW version effective today, so past days never change.
 */
export async function updateTask(user: AppUser, id: string, patch: TaskPatch) {
  await withUserDb(user.id, async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId: user.id }, include: { versions: { orderBy: { effectiveFrom: "asc" } } } });
    if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found");
    if (task.isAiGated && patch.isAiGated === false) {
      throw new ApiError(409, "AI_GATE_LOCKED", "AI-guided completion cannot be disabled after it is enabled");
    }
    if (task.archivedOn) throw new ApiError(409, "ARCHIVED", "Archived tasks cannot be edited");
    const today = todayIn(user.timezone);
    const start = d2s(task.startDate);
    const eff = today > start ? today : start;
    const cur = [...task.versions].reverse().find((v) => d2s(v.effectiveFrom) <= eff) ?? task.versions[0];
    const isAiGated = patch.isAiGated ?? task.isAiGated;
    const aiSubject = patch.aiSubject !== undefined
      ? patch.aiSubject
      : patch.isAiGated === false
        ? null
        : task.aiSubject;
    const aiCourseName = patch.aiCourseName !== undefined
      ? patch.aiCourseName
      : patch.aiSubject !== undefined && patch.aiSubject !== "CUSTOM"
        ? null
        : task.aiCourseName;
    const aiCoursePrompt = patch.aiCoursePrompt !== undefined
      ? patch.aiCoursePrompt
      : patch.aiSubject !== undefined && patch.aiSubject !== "CUSTOM"
        ? null
        : task.aiCoursePrompt;

    const recurrence = (patch.recurrence ?? cur.recurrence) as Recurrence;
    const completionType = patch.completionType ?? cur.completionType;
    validateStudySettings({
      isAiGated,
      aiSubject,
      aiCourseName,
      aiCoursePrompt,
    });
    const merged = {
      isMandatory: patch.isMandatory ?? cur.isMandatory,
      completionType,
      recurrence,
      weekdays: recurrence === "WEEKDAYS" ? patch.weekdays ?? cur.weekdays : [],
      unit: completionType === "BOOLEAN" && recurrence !== "WEEKLY_TOTAL"
        ? null
        : patch.unit !== undefined ? patch.unit : cur.unit,
      target: completionType === "BOOLEAN" && recurrence !== "WEEKLY_TOTAL" ? 1 : patch.target ?? cur.target,
    };
    validateRules(merged);
    const changed =
      merged.isMandatory !== cur.isMandatory || merged.recurrence !== cur.recurrence || merged.target !== cur.target ||
      merged.unit !== cur.unit || merged.completionType !== cur.completionType || merged.weekdays.join() !== cur.weekdays.join();

    await tx.task.update({
      where: { id },
      data: {
        title: patch.title, description: patch.description, category: patch.category,
        isAiGated: patch.isAiGated, aiSubject: patch.aiSubject, aiCourseName, aiCoursePrompt,
        archivedOn: patch.archived ? s2d(today) : undefined,
      },
    });
    if (changed) {
      await tx.taskVersion.upsert({
        where: { taskId_effectiveFrom: { taskId: id, effectiveFrom: s2d(eff) } },
        create: { taskId: id, effectiveFrom: s2d(eff), ...merged },
        update: merged,
      });
    }
  });
  return { id };
}

/** Hard delete only when there is no history; otherwise the client should archive. */
export async function deleteTask(user: AppUser, id: string) {
  await withUserDb(user.id, async (tx) => {
    const task = await tx.task.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found");
    const logs = await tx.taskLog.count({ where: { taskId: id, userId: user.id } });
    if (logs > 0) throw new ApiError(409, "HAS_HISTORY", "This task has history. Archive it instead to keep your stats.");
    await tx.task.delete({ where: { id } });
  });
}

/** Idempotent: sets an ABSOLUTE value for (task, date). Repeating the request changes nothing. */
export async function setProgress(user: AppUser, taskId: string, date: string, value: number, clientUpdatedAt?: string) {
  return writeProgress(user, taskId, date, value, false, clientUpdatedAt);
}

export async function completeAiStudyTask(user: AppUser, taskId: string) {
  const today = todayIn(user.timezone);
  const task = (await loadTasks(user.id)).find((item) => item.id === taskId);
  if (!task?.isAiGated) throw new ApiError(404, "NOT_FOUND", "AI-guided task not found");
  const version = scheduledOn(task, today);
  if (!version) throw new ApiError(400, "NOT_SCHEDULED", "This task is not scheduled today");
  const value = version.recurrence === "WEEKLY_TOTAL"
    ? 1
    : version.completionType === "MEASURABLE"
      ? version.target
      : 1;
  const progress = await writeProgress(user, taskId, today, value, true);
  if (version.recurrence !== "WEEKLY_TOTAL") return { ...progress, completed: true };

  const logs = await loadLogs(user.id);
  const total = weekDays(weekStart(today, user.weekStartsOn))
    .reduce((sum, date) => sum + (logs.get(logKey(taskId, date)) ?? 0), 0);
  return { ...progress, completed: total >= version.target };
}

export async function aiStudyTaskContext(user: AppUser, taskId: string) {
  const [tasks, logs] = await Promise.all([loadTasks(user.id), loadLogs(user.id)]);
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found");
  if (!task.isAiGated || !task.aiSubject) {
    throw new ApiError(400, "NOT_AI_GATED", "This task does not use AI-guided completion");
  }
  const date = todayIn(user.timezone);
  const version = scheduledOn(task, date);
  if (!version) throw new ApiError(400, "NOT_SCHEDULED", "This task is not scheduled today");
  const value = logs.get(logKey(task.id, date));
  const isCompleted = version.recurrence === "WEEKLY_TOTAL"
    ? weekDays(weekStart(date, user.weekStartsOn)).reduce((sum, day) => sum + (logs.get(logKey(task.id, day)) ?? 0), 0) >= version.target
    : isDone(version, value);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    subject: task.aiSubject,
    aiCourseName: task.aiCourseName,
    aiCoursePrompt: task.aiCoursePrompt,
    date,
    isCompleted,
  };
}

async function writeProgress(user: AppUser, taskId: string, date: string, value: number, allowAiGated: boolean, clientUpdatedAt?: string) {
  const today = todayIn(user.timezone);
  if (date > today) throw new ApiError(400, "FUTURE_DATE", "Cannot log future dates");
  if (date < addDays(today, -BACKDATE_DAYS)) throw new ApiError(400, "TOO_OLD", `You can only edit the last ${BACKDATE_DAYS} days`);
  const tasks = (await loadTasks(user.id)).filter((t) => t.id === taskId);
  if (!tasks.length) throw new ApiError(404, "NOT_FOUND", "Task not found");
  if (tasks[0].isAiGated !== allowAiGated) {
    throw new ApiError(403, "AI_GATE_REQUIRED", tasks[0].isAiGated
      ? "Complete this task through its AI study session"
      : "This task does not use AI study completion");
  }
  const v = scheduledOn(tasks[0], date);
  if (!v) throw new ApiError(400, "NOT_SCHEDULED", "This task is not scheduled on that date");
  const final = v.completionType === "BOOLEAN" ? (value > 0 ? 1 : 0) : value;
  const withDb = allowAiGated ? withAiStudyDb : withUserDb;
  await withDb(user.id, async (tx) => {
    const existingLog = await tx.taskLog.findUnique({
      where: { taskId_localDate: { taskId, localDate: s2d(date) } },
      select: { id: true, updatedAt: true, value: true },
    });

    if (shouldRejectStaleWrite(existingLog?.updatedAt, clientUpdatedAt)) {
      throw new ApiError(409, "CONFLICT", "Update rejected: a newer version already exists on the server");
    }

    if (final === 0) {
      await tx.taskLog.deleteMany({ where: { taskId, userId: user.id, localDate: s2d(date) } });
    } else {
      await tx.taskLog.upsert({
        where: { taskId_localDate: { taskId, localDate: s2d(date) } },
        create: { userId: user.id, taskId, localDate: s2d(date), value: final },
        update: { value: final },
      });
    }
  });
  return { taskId, date, value: final };
}
