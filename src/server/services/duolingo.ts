import { withUserDb } from "@/lib/db";
import { todayIn } from "@/lib/domain/dates";
import { scheduledOn } from "@/lib/domain/schedule";
import { loadTasks } from "@/server/repositories/tasks";
import { setProgress } from "@/server/services/tasks";
import type { AppUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";

export interface DuolingoSyncResult {
  provider: "DUOLINGO";
  username: string;
  lastSyncedAt: string;
  lastStatus: "COMPLETED_TODAY" | "NOT_COMPLETED_TODAY" | "PRIVATE_PROFILE" | "RATE_LIMITED" | "USER_NOT_FOUND" | "NETWORK_ERROR";
  completedToday: boolean;
  xpGainedToday: number;
  streak: number;
  warning?: string;
  canManualOverride: boolean;
  taskCompleted?: boolean;
}

export async function getDuolingoIntegration(userId: string) {
  return withUserDb(userId, (tx) =>
    tx.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "DUOLINGO",
        },
      },
    })
  );
}

export async function upsertDuolingoIntegration(userId: string, externalUsername: string) {
  return withUserDb(userId, (tx) =>
    tx.userIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: "DUOLINGO",
        },
      },
      create: {
        userId,
        provider: "DUOLINGO",
        externalUsername: externalUsername.trim(),
        lastStatus: "PENDING",
      },
      update: {
        externalUsername: externalUsername.trim(),
      },
    })
  );
}

export async function syncDuolingo(
  user: { id: string; timezone: string; weekStartsOn?: 1 | 7 },
  inputUsername?: string,
  targetTaskId?: string
): Promise<DuolingoSyncResult> {
  let integration = await getDuolingoIntegration(user.id);

  const username = inputUsername?.trim() || integration?.externalUsername;
  if (!username) {
    throw new ApiError(400, "MISSING_USERNAME", "Duolingo username is required for verification");
  }

  // Save username if updated
  if (!integration || integration.externalUsername !== username) {
    integration = await upsertDuolingoIntegration(user.id, username);
  }

  const result: DuolingoSyncResult = {
    provider: "DUOLINGO",
    username,
    lastSyncedAt: new Date().toISOString(),
    lastStatus: "NOT_COMPLETED_TODAY",
    completedToday: false,
    xpGainedToday: 0,
    streak: 0,
    canManualOverride: true,
  };

  try {
    const duolingoUrl = `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(username)}`;
    const response = await fetch(duolingoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (RoutineTracker/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (response.status === 429) {
      result.lastStatus = "RATE_LIMITED";
      result.warning = "Duolingo rate limit reached. Non-blocking manual override is enabled.";
    } else if (response.status === 403) {
      result.lastStatus = "PRIVATE_PROFILE";
      result.warning = "Your Duolingo profile is set to private. Make it public in Duolingo settings or use manual completion.";
    } else if (response.ok) {
      const data = await response.json().catch(() => null);
      const userObj = data?.users?.[0];

      if (!userObj) {
        // Fallback to legacy v1 endpoint
        const legacyRes = await fetch(`https://www.duolingo.com/users/${encodeURIComponent(username)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (RoutineTracker/1.0)", Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);

        if (legacyRes && legacyRes.ok) {
          const legacyData = await legacyRes.json().catch(() => null);
          if (legacyData?.username) {
            const streak = Number(legacyData.site_streak ?? legacyData.streak ?? 0);
            const extendedToday = Boolean(legacyData.streak_extended_today);
            result.streak = streak;
            result.xpGainedToday = extendedToday ? 10 : 0;
            result.completedToday = extendedToday;
            result.lastStatus = extendedToday ? "COMPLETED_TODAY" : "NOT_COMPLETED_TODAY";
          } else {
            result.lastStatus = "USER_NOT_FOUND";
            result.warning = `Duolingo user "${username}" was not found.`;
          }
        } else {
          result.lastStatus = "USER_NOT_FOUND";
          result.warning = `Duolingo user "${username}" was not found.`;
        }
      } else {
        const privacySettings: string[] = userObj.privacySettings || [];
        if (privacySettings.includes("DISABLE_PUBLIC_PROFILE")) {
          result.lastStatus = "PRIVATE_PROFILE";
          result.warning = "Your Duolingo profile is private. You can verify manually.";
        } else {
          const xpGainedToday = typeof userObj.xpGainedToday === "number" ? userObj.xpGainedToday : 0;
          const streak = typeof userObj.streak === "number" ? userObj.streak : (typeof userObj.site_streak === "number" ? userObj.site_streak : 0);
          const streakExtendedToday = Boolean(userObj.streakData?.currentStreak?.startDate);

          result.xpGainedToday = xpGainedToday;
          result.streak = streak;

          // Check if lessons were completed today
          if (xpGainedToday > 0 || streakExtendedToday) {
            result.completedToday = true;
            result.lastStatus = "COMPLETED_TODAY";
          } else {
            result.lastStatus = "NOT_COMPLETED_TODAY";
          }
        }
      }
    } else if (response.status === 404) {
      // Fallback to legacy v1 endpoint
      const legacyRes = await fetch(`https://www.duolingo.com/users/${encodeURIComponent(username)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (RoutineTracker/1.0)", Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (legacyRes && legacyRes.ok) {
        const legacyData = await legacyRes.json().catch(() => null);
        if (legacyData?.username) {
          const streak = Number(legacyData.site_streak ?? legacyData.streak ?? 0);
          const extendedToday = Boolean(legacyData.streak_extended_today);
          result.streak = streak;
          result.xpGainedToday = extendedToday ? 10 : 0;
          result.completedToday = extendedToday;
          result.lastStatus = extendedToday ? "COMPLETED_TODAY" : "NOT_COMPLETED_TODAY";
        } else {
          result.lastStatus = "USER_NOT_FOUND";
          result.warning = `Duolingo user "${username}" was not found. Check the username or complete manually.`;
        }
      } else {
        result.lastStatus = "USER_NOT_FOUND";
        result.warning = `Duolingo user "${username}" was not found. Check the username or complete manually.`;
      }
    } else {
      result.lastStatus = "NETWORK_ERROR";
      result.warning = "Could not reach Duolingo API. Non-blocking manual override is available.";
    }
  } catch (err: unknown) {
    console.warn("[Duolingo Sync] Network/fetch error", err);
    result.lastStatus = "NETWORK_ERROR";
    result.warning = "Network timeout reaching Duolingo. You may mark this task complete manually.";
  }

  // Update integration record in database
  await withUserDb(user.id, (tx) =>
    tx.userIntegration.update({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "DUOLINGO",
        },
      },
      data: {
        lastSyncedAt: new Date(),
        lastStatus: result.lastStatus,
        metadata: {
          xpGainedToday: result.xpGainedToday,
          streak: result.streak,
          warning: result.warning,
        },
      },
    })
  );

  // If completed today, auto-complete the corresponding task in TaskLog!
  if (result.completedToday) {
    const today = todayIn(user.timezone);
    const tasks = await loadTasks(user.id);

    // Find target task: either targetTaskId or task with Duolingo in title
    let taskToComplete = targetTaskId ? tasks.find((t) => t.id === targetTaskId) : undefined;
    if (!taskToComplete) {
      taskToComplete = tasks.find(
        (t) =>
          !t.isAiGated &&
          (t.title.toLowerCase().includes("duolingo") ||
            t.description?.toLowerCase().includes("duolingo"))
      );
    }

    if (taskToComplete) {
      const scheduled = scheduledOn(taskToComplete, today);
      if (scheduled) {
        try {
          await setProgress(user as AppUser, taskToComplete.id, today, scheduled.target);
          result.taskCompleted = true;
        } catch (err) {
          console.warn("[Duolingo Sync] Failed to write progress to task log", err);
        }
      }
    }
  }

  return result;
}
