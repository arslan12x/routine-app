import { inngest, reminderSendEvent } from "@/inngest/client";
import { getReminderSlot } from "@/lib/domain/reminders";
import { systemDb } from "@/lib/db";
import { usernameFromCredentialEmail } from "@/lib/auth/credentials";
import { dispatchUserTaskReminder } from "@/server/services/reminders";

export const scheduleTaskReminders = inngest.createFunction(
  { id: "schedule-task-reminders", triggers: { cron: "* * * * *" } },
  async ({ step }) => {
    const events = await step.run("find-reminder-recipients", async () => {
      const allowedAccounts = await systemDb.allowedEmail.findMany({
        where: { revokedAt: null },
        select: { email: true },
      });
      const activeEmails = allowedAccounts
        .map(({ email }) => email)
        .filter((email) => usernameFromCredentialEmail(email));
      if (activeEmails.length === 0) return [];

      const users = await systemDb.user.findMany({
        where: {
          email: { in: activeEmails },
          settings: { isNot: null },
          pushSubscriptions: { some: {} },
        },
        select: { id: true, email: true, settings: { select: { timezone: true } } },
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
  { id: "send-task-reminder", retries: 5, triggers: { event: reminderSendEvent } },
  async ({ event, step }) => step.run("send-user-reminder", () =>
    dispatchUserTaskReminder(event.data.userId, event.data.date, event.data.hour),
  ),
);

export const reminderFunctions = [scheduleTaskReminders, sendTaskReminder];
