import type { Prisma } from "@/generated/prisma/client";
import { withUserDb } from "@/lib/db";
import { logKey } from "@/lib/domain/schedule";
import type { Category, CompletionType, LogMap, Recurrence, TaskDef } from "@/lib/domain/types";

export const d2s = (d: Date) => d.toISOString().slice(0, 10);
export const s2d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function mapTaskRows(rows: Awaited<ReturnType<typeof queryTasks>>): TaskDef[] {
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category as Category,
    isAiGated: t.isAiGated,
    aiSubject: t.aiSubject,
    aiCourseName: t.aiCourseName,
    aiCoursePrompt: t.aiCoursePrompt,
    sortOrder: t.sortOrder,
    startDate: d2s(t.startDate),
    archivedOn: t.archivedOn ? d2s(t.archivedOn) : null,
    versions: t.versions.map((v) => ({
      effectiveFrom: d2s(v.effectiveFrom),
      isMandatory: v.isMandatory,
      completionType: v.completionType as CompletionType,
      target: v.target,
      unit: v.unit,
      recurrence: v.recurrence as Recurrence,
      weekdays: v.weekdays,
    })),
  }));
}

function queryTasks(tx: Prisma.TransactionClient, userId: string) {
  return tx.task.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      isAiGated: true,
      aiSubject: true,
      aiCourseName: true,
      aiCoursePrompt: true,
      sortOrder: true,
      startDate: true,
      archivedOn: true,
      versions: {
        select: {
          effectiveFrom: true,
          isMandatory: true,
          completionType: true,
          target: true,
          unit: true,
          recurrence: true,
          weekdays: true,
        },
        orderBy: { effectiveFrom: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

function mapLogRows(rows: { taskId: string; localDate: Date; value: number }[]): LogMap {
  return new Map(rows.map((r) => [logKey(r.taskId, d2s(r.localDate)), r.value]));
}

// Every query here is scoped by userId. That is the IDOR defence: there is no way to load another user's rows.
export async function loadTasks(userId: string): Promise<TaskDef[]> {
  const rows = await withUserDb(userId, (tx) => queryTasks(tx, userId));
  return mapTaskRows(rows);
}

export async function loadLogs(userId: string): Promise<LogMap> {
  const rows = await withUserDb(userId, (tx) => tx.taskLog.findMany({ where: { userId }, select: { taskId: true, localDate: true, value: true } }));
  return mapLogRows(rows);
}

/** Fetch both leaderboard inputs in one user-scoped transaction to reduce pool pressure. */
export async function loadTaskData(userId: string): Promise<{ tasks: TaskDef[]; logs: LogMap }> {
  const data = await withUserDb(userId, async (tx) => {
    const [tasks, logs] = await Promise.all([
      queryTasks(tx, userId),
      tx.taskLog.findMany({ where: { userId }, select: { taskId: true, localDate: true, value: true } }),
    ]);
    return { tasks, logs };
  });
  return { tasks: mapTaskRows(data.tasks), logs: mapLogRows(data.logs) };
}
