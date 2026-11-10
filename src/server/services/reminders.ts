import * as webpush from "web-push";
import { systemDb } from "@/lib/db";
import { usernameFromCredentialEmail } from "@/lib/auth/credentials";
import { getReminderSlot, reminderMessage } from "@/lib/domain/reminders";
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

export async function dispatchTaskReminders(now = new Date()) {
  configurePush();
  const subscriptions = await systemDb.pushSubscription.findMany({
    select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true },
  });
  if (subscriptions.length === 0) return { sent: 0 };

  const userIds = [...new Set(subscriptions.map((subscription) => subscription.userId))];
  const [users, allowed] = await Promise.all([
    systemDb.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        settings: {
          select: {
            timezone: true,
            timezoneSet: true,
            weekStartsOn: true,
            displayName: true,
            showOnLeaderboard: true,
          },
        },
      },
    }),
    systemDb.allowedEmail.findMany({
      where: { revokedAt: null },
      select: { email: true, role: true },
    }),
  ]);
  const allowedByEmail = new Map(allowed.map((row) => [row.email, row.role]));
  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const userSubscriptions = subscriptionsByUser.get(subscription.userId) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.userId, userSubscriptions);
  }

  let sent = 0;
  for (const user of users) {
    const username = usernameFromCredentialEmail(user.email);
    const role = allowedByEmail.get(user.email.toLowerCase());
    const settings = user.settings;
    if (!username || !role || !settings) continue;

    const slot = getReminderSlot(now, settings.timezone);
    if (!slot) continue;
    const appUser: AppUser = {
      id: user.id,
      username,
      name: user.name,
      image: user.image,
      role,
      timezone: settings.timezone,
      timezoneSet: settings.timezoneSet,
      weekStartsOn: settings.weekStartsOn === 7 ? 7 : 1,
      displayName: settings.displayName,
      showOnLeaderboard: settings.showOnLeaderboard,
    };
    const today = await dayView(appUser, slot.date);
    const remainingTasks = [...today.mandatory, ...today.extra].filter((task) => !task.done).length;
    if (remainingTasks === 0) continue;

    for (const subscription of subscriptionsByUser.get(user.id) ?? []) {
      try {
        await systemDb.reminderDelivery.create({
          data: {
            subscriptionId: subscription.id,
            localDate: new Date(`${slot.date}T00:00:00.000Z`),
            reminderHour: slot.hour,
          },
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
            body: reminderMessage(remainingTasks, slot.hour),
            url: "/tasks",
            tag: `routine-${slot.date}-${slot.hour}`,
          }),
        );
        sent += 1;
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? error.statusCode
          : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await systemDb.pushSubscription.delete({ where: { id: subscription.id } });
        } else {
          await systemDb.reminderDelivery.deleteMany({
            where: {
              subscriptionId: subscription.id,
              localDate: new Date(`${slot.date}T00:00:00.000Z`),
              reminderHour: slot.hour,
            },
          });
          console.error("Task reminder delivery failed", error);
        }
      }
    }
  }
  return { sent };
}
