import * as webpush from "web-push";
import { systemDb } from "@/lib/db";
import { isReminderHour, reminderMessage } from "@/lib/domain/reminders";
import { dayView } from "@/server/services/tasks";
import type { AppUser } from "@/lib/auth/session";

function configurePush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("Web Push VAPID configuration is missing");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function dispatchUserTaskReminder(userId: string, date: string, hour: 21 | 22 | 23, now = new Date()) {
  const user = await systemDb.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      image: true,
      banned: true,
      members: { select: { role: true }, take: 1 },
      settings: {
        select: {
          timezone: true,
          timezoneSet: true,
          weekStartsOn: true,
          displayName: true,
          showOnLeaderboard: true,
        },
      },
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });
  if (!user?.settings || user.banned || user.pushSubscriptions.length === 0 || user.members.length === 0) return { sent: 0 };

  const memberRole = user.members[0]?.role ?? "member";
  if (!isReminderHour(now, user.settings.timezone, { date, hour })) return { sent: 0 };

  const appUser: AppUser = {
    id: user.id,
    username: user.username ?? user.name,
    name: user.name,
    image: user.image,
    role: memberRole === "owner" || memberRole === "admin" ? "ADMIN" : "MEMBER",
    timezone: user.settings.timezone,
    timezoneSet: user.settings.timezoneSet,
    weekStartsOn: user.settings.weekStartsOn === 7 ? 7 : 1,
    displayName: user.settings.displayName,
    showOnLeaderboard: user.settings.showOnLeaderboard,
  };
  const today = await dayView(appUser, date);
  const remainingTasks = [...today.mandatory, ...today.extra].filter((task) => !task.done).length;
  if (remainingTasks === 0) return { sent: 0 };

  configurePush();
  let sent = 0;
  let failed = 0;
  const localDate = new Date(`${date}T00:00:00.000Z`);
  for (const subscription of user.pushSubscriptions) {
    try {
      await systemDb.reminderDelivery.create({
        data: { subscriptionId: subscription.id, localDate, reminderHour: hour },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({
          title: "Routine reminder",
          body: reminderMessage(remainingTasks, hour),
          url: "/tasks",
          tag: `routine-${date}-${hour}`,
        }),
      );
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await systemDb.pushSubscription.delete({ where: { id: subscription.id } });
        continue;
      }

      await systemDb.reminderDelivery.deleteMany({
        where: { subscriptionId: subscription.id, localDate, reminderHour: hour },
      });
      console.error("Task reminder delivery failed; Inngest will retry", { statusCode });
      failed += 1;
    }
  }
  if (failed > 0) throw new Error(`${failed} Web Push delivery attempt(s) failed and will be retried.`);
  return { sent };
}
