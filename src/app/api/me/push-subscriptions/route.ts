import { z } from "zod";
import { ApiError, route, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { systemDb, withUserDb } from "@/lib/db";

const endpoint = z.url({ protocol: /^https$/ }).max(2048).refine((value) => {
  const { hostname, port } = new URL(value);
  return !port && (
    hostname === "fcm.googleapis.com" ||
    hostname === "web.push.apple.com" ||
    hostname.endsWith(".push.services.mozilla.com") ||
    hostname.endsWith(".notify.windows.com")
  );
}, "Unsupported push service endpoint");
const subscriptionBody = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});
const endpointBody = z.object({ endpoint });

export const GET = route(async () => ({
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
}));

export const POST = route(async (req) => {
  const user = await requireUser();
  const subscription = await parseBody(req, subscriptionBody);
  const existing = await systemDb.pushSubscription.findUnique({
    where: { endpoint: subscription.endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== user.id) {
    throw new ApiError(409, "SUBSCRIPTION_IN_USE", "This push subscription belongs to another account.");
  }
  await withUserDb(user.id, (tx) => tx.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: user.id,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  }));
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { endpoint } = await parseBody(req, endpointBody);
  await withUserDb(user.id, (tx) => tx.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } }));
  return { ok: true };
});
