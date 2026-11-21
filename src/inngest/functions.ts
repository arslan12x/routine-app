import * as Sentry from "@sentry/nextjs";
import { inngest, reminderSendEvent } from "@/inngest/client";
import { getReminderSlot } from "@/lib/domain/reminders";
import { systemDb } from "@/lib/db";
import { generateWeeklyCoachReview } from "@/server/ai/coach";
import { syncDuolingo } from "@/server/services/duolingo";
import { rotateStartupCompanies } from "@/server/services/job-scraper";
import { advanceJobPipeline } from "@/server/services/jobs";
import { syncRecruiterRepliesForUser } from "@/server/services/email-inbox";
import { dispatchUserTaskReminder } from "@/server/services/reminders";
import type { AppUser } from "@/lib/auth/session";

export const scheduleTaskReminders = inngest.createFunction(
  {
    id: "schedule-task-reminders",
    triggers: { cron: "* * * * *" },
    onFailure: async ({ error }) => {
      Sentry.captureException(error, {
        tags: { inngestFunction: "schedule-task-reminders" },
      });
    },
  },
  async ({ step }) => {
    const events = await step.run("find-reminder-recipients", async () => {
      const users = await systemDb.user.findMany({
        where: {
          banned: false,
          settings: { isNot: null },
          pushSubscriptions: { some: {} },
          members: { some: { organization: { slug: "routine-workspace" } } },
        },
        select: { id: true, settings: { select: { timezone: true } } },
      });
      const now = new Date();
      return users.flatMap((user) => {
        if (!user.settings) return [];
        const slot = getReminderSlot(now, user.settings.timezone);
        if (!slot) return [];
        return [{
          id: `task-reminder-${user.id}-${slot.date}-${slot.hour}`,
          name: "notification.send" as const,
          data: { userId: user.id, date: slot.date, hour: slot.hour },
        }];
      });
    });

    if (events.length === 0) return { queued: 0 };
    await step.sendEvent("send-reminder-events", events);
    return { queued: events.length };
  },
);

export const sendTaskReminder = inngest.createFunction(
  {
    id: "send-task-reminder",
    retries: 5,
    triggers: { event: reminderSendEvent },
    onFailure: async ({ error, event }) => {
      Sentry.captureException(error, {
        tags: { inngestFunction: "send-task-reminder" },
        extra: { event },
      });
    },
  },
  async ({ event, step }) => step.run("send-user-reminder", () =>
    dispatchUserTaskReminder(event.data.userId, event.data.date, event.data.hour),
  ),
);

export const weeklyRoutineCoach = inngest.createFunction(
  {
    id: "weekly-routine-coach",
    triggers: { cron: "0 21 * * 0" }, // Runs Sunday nights at 21:00 UTC
    onFailure: async ({ error }) => {
      Sentry.captureException(error, {
        tags: { inngestFunction: "weekly-routine-coach" },
      });
    },
  },
  async ({ step }) => {
    const userIds = await step.run("find-active-users", async () => {
      const users = await systemDb.user.findMany({
        where: { banned: false },
        select: { id: true },
      });
      return users.map((u) => u.id);
    });

    if (userIds.length === 0) return { processed: 0 };

    for (const userId of userIds) {
      await step.run(`coach-review-${userId}`, () => generateWeeklyCoachReview(userId));
    }

    return { processed: userIds.length };
  },
);

export const duolingoDailySync = inngest.createFunction(
  {
    id: "duolingo-daily-sync",
    triggers: { cron: "0 */4 * * *" }, // Run every 4 hours
    onFailure: async ({ error }) => {
      Sentry.captureException(error, {
        tags: { inngestFunction: "duolingo-daily-sync" },
      });
    },
  },
  async ({ step }) => {
    const integrations = await step.run("find-duolingo-integrations", async () => {
      return systemDb.userIntegration.findMany({
        where: { provider: "DUOLINGO" },
        include: {
          user: {
            select: {
              id: true,
              settings: {
                select: { timezone: true, weekStartsOn: true },
              },
            },
          },
        },
      });
    });

    if (integrations.length === 0) return { synced: 0 };

    for (const item of integrations) {
      if (!item.user) continue;
      await step.run(`sync-duo-${item.userId}`, async () => {
        const userContext = {
          id: item.user.id,
          timezone: item.user.settings?.timezone || "Asia/Kolkata",
          weekStartsOn: (item.user.settings?.weekStartsOn === 7 ? 7 : 1) as 1 | 7,
        };
        return syncDuolingo(userContext, item.externalUsername);
      });
    }

    return { synced: integrations.length };
  },
);

export const startupRotationCron = inngest.createFunction(
  {
    id: "rotate-startup-companies",
    triggers: { cron: "0 0 */2 * *" }, // Runs every 2 days
    onFailure: async ({ error }) => {
      Sentry.captureException(error, {
        tags: { inngestFunction: "rotate-startup-companies" },
      });
    },
  },
  async ({ step }) => {
    return step.run("rotate-startups", () => rotateStartupCompanies());
  },
);

export const jobFollowUpScheduler = inngest.createFunction(
  {
    id: "advance-job-pipeline",
    triggers: { cron: "0 * * * *" }, // Runs hourly to advance follow-up states
    onFailure: async ({ error }) => {
      Sentry.captureException(error, {
        tags: { inngestFunction: "advance-job-pipeline" },
      });
    },
  },
  async ({ step }) => {
    // 1. First, check recruiter replies via IMAP for all users who configured DIRECT_EMAIL
    const emailIntegrations = await step.run("load-direct-email-users", async () => {
      return systemDb.userIntegration.findMany({
        where: { provider: "DIRECT_EMAIL" },
        select: { userId: true },
      });
    });

    for (const item of emailIntegrations) {
      await step.run(`sync-imap-${item.userId}`, async () => {
        try {
          return await syncRecruiterRepliesForUser(item.userId, true);
        } catch (err) {
          console.warn(`[Inngest] IMAP sync failed for user ${item.userId}`, err);
          return { error: String(err) };
        }
      });
    }

    // 2. Now promote waiting stages and auto-send due follow-ups
    return step.run("advance-pipeline", () => advanceJobPipeline());
  },
);

export const reminderFunctions = [
  scheduleTaskReminders,
  sendTaskReminder,
  weeklyRoutineCoach,
  duolingoDailySync,
  startupRotationCron,
  jobFollowUpScheduler,
];
