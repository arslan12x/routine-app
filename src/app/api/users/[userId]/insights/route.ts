import { ApiError, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { computeInsights, type Group } from "@/lib/domain/analytics";
import { daysBetween, monthOf, todayIn, weekStart } from "@/lib/domain/dates";
import { computeStreaks, recentConsistency } from "@/lib/domain/streaks";
import { insightsQuery } from "@/lib/validation";
import { loadTaskData } from "@/server/repositories/tasks";

export const GET = route<{ userId: string }>(async (req, params) => {
  const currentUser = await requireUser();
  const targetUserId = params.userId;

  if (targetUserId !== currentUser.id) {
    const friendship = await systemDb.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: currentUser.id, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: currentUser.id },
        ],
      },
      select: { id: true },
    });

    if (!friendship) {
      throw new ApiError(403, "FORBIDDEN", "You can only view insights for yourself or accepted friends.");
    }
  }

  const targetUser = await systemDb.user.findUnique({
    where: { id: targetUserId, banned: false },
    select: {
      id: true,
      name: true,
      image: true,
      settings: {
        select: {
          displayName: true,
          timezone: true,
          weekStartsOn: true,
        },
      },
    },
  });

  if (!targetUser) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }

  const q = parseQuery(req, insightsQuery);
  const timezone = targetUser.settings?.timezone ?? "Asia/Kolkata";
  const weekStartsOn = (targetUser.settings?.weekStartsOn === 7 ? 7 : 1) as 1 | 7;
  const today = todayIn(timezone);

  let from = today;
  let to = today;
  if (q.range === "week") from = weekStart(today, weekStartsOn);
  if (q.range === "month") from = `${monthOf(today)}-01`;
  if (q.range === "custom") {
    if (!q.from || !q.to || q.from > q.to) throw new ApiError(400, "VALIDATION", "Provide a valid from/to range");
    from = q.from;
    to = q.to;
    if (daysBetween(from, to).length > 366) throw new ApiError(400, "VALIDATION", "Range is limited to 366 days");
  }

  const span = daysBetween(from, to).length;
  const group: Group = q.group ?? (span > 92 ? "week" : "day");

  const { tasks, logs } = await loadTaskData(targetUser.id);
  const computed = computeInsights({ tasks, logs, from, to, group, today, weekStartsOn });
  const s = computeStreaks(tasks, logs, today);
  const c = recentConsistency(tasks, logs, today, 30, 7);

  // Return strictly shareable habit, streak, and completion metrics only
  return {
    user: {
      id: targetUser.id,
      displayName: targetUser.settings?.displayName ?? targetUser.name,
      image: targetUser.image,
      isMe: targetUser.id === currentUser.id,
    },
    from,
    to,
    group,
    kpis: {
      totalCompleted: computed.kpis.totalCompleted,
      mandatoryRate: computed.kpis.mandatoryRate,
      extraRate: computed.kpis.extraRate,
      overallRate: computed.kpis.overallRate,
      consistency: c.rate,
      currentStreak: s.current,
      longestStreak: s.longest,
      bestWeekday: computed.kpis.bestWeekday,
    },
    trend: computed.trend,
    categories: computed.categories,
  };
});
