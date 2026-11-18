import { systemDb } from "@/lib/db";
import { todayIn } from "@/lib/domain/dates";
import { computeStreaks, recentConsistency } from "@/lib/domain/streaks";
import {
  BADGE_DEFINITIONS,
  evaluateEligibleBadges,
  type BadgeInfo,
  type UserMetrics,
} from "@/lib/domain/achievements";
import { loadTaskData } from "@/server/repositories/tasks";

export async function syncUserAchievements(userId: string, preloadedMetrics?: UserMetrics): Promise<BadgeInfo[]> {
  let metrics = preloadedMetrics;
  if (!metrics) {
    const user = await systemDb.user.findUnique({
      where: { id: userId },
      select: { settings: { select: { timezone: true } } },
    });
    const timezone = user?.settings?.timezone ?? "Asia/Kolkata";
    const { tasks, logs } = await loadTaskData(userId);
    const today = todayIn(timezone);
    const s = computeStreaks(tasks, logs, today);
    const c = recentConsistency(tasks, logs, today, 30, 7);
    metrics = {
      tasks,
      logs,
      currentStreak: s.current,
      longestStreak: s.longest,
      consistencyRate: c.rate,
      successDays: s.successDays,
    };
  }

  const eligibleBadgeTypes = evaluateEligibleBadges(metrics);
  if (eligibleBadgeTypes.length > 0) {
    await systemDb.achievement.createMany({
      data: eligibleBadgeTypes.map((badgeType) => ({
        userId,
        badgeType,
      })),
      skipDuplicates: true,
    });
  }

  const achievements = await systemDb.achievement.findMany({
    where: { userId },
    select: { badgeType: true },
    orderBy: { unlockedAt: "asc" },
  });

  return achievements
    .map((a) => BADGE_DEFINITIONS[a.badgeType])
    .filter((b): b is BadgeInfo => Boolean(b));
}

export async function getUsersBadgesMap(userIds: string[]): Promise<Map<string, BadgeInfo[]>> {
  if (userIds.length === 0) return new Map();

  const achievements = await systemDb.achievement.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, badgeType: true },
    orderBy: { unlockedAt: "asc" },
  });

  const map = new Map<string, BadgeInfo[]>();
  for (const item of achievements) {
    const def = BADGE_DEFINITIONS[item.badgeType];
    if (!def) continue;
    const existing = map.get(item.userId) ?? [];
    existing.push(def);
    map.set(item.userId, existing);
  }
  return map;
}
