import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import { systemDb, withUserDb } from "@/lib/db";
import { addDays, daysBetween, monthOf, monthRange, todayIn, weekStart } from "@/lib/domain/dates";
import { computeInsights, type Group } from "@/lib/domain/analytics";
import { rankRows, type BoardRow } from "@/lib/domain/ranking";
import { isDone, logKey, scheduledOn, weekDays } from "@/lib/domain/schedule";
import { computeStreaks, recentConsistency, statusRange } from "@/lib/domain/streaks";
import { d2s, loadLogs, loadTaskData, loadTasks } from "@/server/repositories/tasks";

export async function streaks(user: AppUser) {
  const [tasks, logs] = await Promise.all([loadTasks(user.id), loadLogs(user.id)]);
  return computeStreaks(tasks, logs, todayIn(user.timezone));
}

export async function calendar(user: AppUser, month?: string) {
  const today = todayIn(user.timezone);
  const m = month ?? monthOf(today);
  const [from, to] = monthRange(m);
  const [tasks, logs] = await Promise.all([loadTasks(user.id), loadLogs(user.id)]);
  const days = statusRange(tasks, logs, from, to, today).map((day) => {
    const scheduledTasks = tasks.flatMap((task) => {
      const version = scheduledOn(task, day.date);
      if (!version) return [];
      const isCompleted = version.recurrence === "WEEKLY_TOTAL"
        ? weekDays(weekStart(day.date, user.weekStartsOn)).reduce(
            (sum, date) => sum + (logs.get(logKey(task.id, date)) ?? 0),
            0,
          ) >= version.target
        : isDone(version, logs.get(logKey(task.id, day.date)));
      return [{ title: task.title, isCompleted, isMandatory: version.isMandatory && version.recurrence !== "WEEKLY_TOTAL" }];
    });

    return {
      ...day,
      totalMandatoryTasks: day.mandatoryTotal,
      completedMandatoryTasks: day.mandatoryDone,
      tasks: scheduledTasks,
    };
  });
  const s = computeStreaks(tasks, logs, today);
  return {
    month: m, today, weekStartsOn: user.weekStartsOn, days,
    summary: { ...s, monthSuccessDays: days.filter((d) => d.status === "SUCCESS").length },
  };
}

export async function insights(user: AppUser, q: { range: "day" | "week" | "month" | "custom"; from?: string; to?: string; group?: Group }) {
  const today = todayIn(user.timezone);
  let from = today, to = today;
  if (q.range === "week") from = weekStart(today, user.weekStartsOn);
  if (q.range === "month") from = `${monthOf(today)}-01`;
  if (q.range === "custom") {
    if (!q.from || !q.to || q.from > q.to) throw new ApiError(400, "VALIDATION", "Provide a valid from/to range");
    from = q.from; to = q.to;
    if (daysBetween(from, to).length > 366) throw new ApiError(400, "VALIDATION", "Range is limited to 366 days");
  }
  const span = daysBetween(from, to).length;
  const group: Group = q.group ?? (span > 92 ? "week" : "day");
  const [tasks, logs] = await Promise.all([loadTasks(user.id), loadLogs(user.id)]);
  return { from, to, group, ...computeInsights({ tasks, logs, from, to, group, today, weekStartsOn: user.weekStartsOn }) };
}

/** Public projection only: no ids, emails, task titles or per-day data ever leave this function. */
export async function leaderboard(viewer: AppUser) {
  const globalRole = await systemDb.user.findUnique({
    where: { id: viewer.id },
    select: { role: true },
  });
  const visibleUserIds = globalRole?.role === "admin"
    ? undefined
    : await withUserDb(viewer.id, async (tx) => {
        const friendships = await tx.friendship.findMany({
          where: {
            status: "ACCEPTED",
            OR: [{ requesterId: viewer.id }, { addresseeId: viewer.id }],
          },
          select: { requesterId: true, addresseeId: true },
        });
        return [...new Set([
          viewer.id,
          ...friendships.map((friendship) =>
            friendship.requesterId === viewer.id ? friendship.addresseeId : friendship.requesterId,
          ),
        ])];
      });
  const users = await systemDb.user.findMany({
    where: {
      ...(visibleUserIds ? { id: { in: visibleUserIds } } : {}),
      banned: false,
      settings: { is: { showOnLeaderboard: true } },
      members: { some: { organization: { slug: "routine-workspace" } } },
    },
    select: {
      id: true,
      name: true,
      image: true,
      createdAt: true,
      settings: { select: { timezone: true, displayName: true } },
    },
  });
  type Row = BoardRow & { isMe: boolean };
  const rows: Row[] = [];
  for (let i = 0; i < users.length; i += 2) {
    const batch = users.slice(i, i + 2);
    rows.push(...await Promise.all(
      batch.map(async (u): Promise<Row> => {
      const { tasks, logs } = await loadTaskData(u.id);
      const today = todayIn(u.settings?.timezone ?? "Asia/Kolkata");
      const s = computeStreaks(tasks, logs, today);
      const c = recentConsistency(tasks, logs, today, 30, 7);
      return {
        tiebreakId: u.id, isMe: u.id === viewer.id,
        displayName: u.settings?.displayName ?? u.name, image: u.image,
        currentStreak: s.current, longestStreak: s.longest, consistency: c.rate,
        successDays: s.successDays, mandatoryPerDay: c.mandatoryPerDay, joinedAt: u.createdAt.toISOString(),
      };
      }),
    ));
  }
  return rankRows(rows).map(({ tiebreakId: _t, joinedAt: _j, ...pub }) => pub);
}

export async function exportAll(user: AppUser) {
  const [tasks, logs] = await Promise.all([
    loadTasks(user.id),
    withUserDb(user.id, (tx) => tx.taskLog.findMany({
      where: { userId: user.id },
      select: { taskId: true, localDate: true, value: true },
      orderBy: { localDate: "asc" },
    })),
  ]);
  return { exportedAt: new Date().toISOString(), tasks, logs: logs.map((l) => ({ taskId: l.taskId, date: d2s(l.localDate), value: l.value })) };
}
