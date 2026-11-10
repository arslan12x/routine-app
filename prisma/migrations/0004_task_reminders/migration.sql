CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "reminderHour" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE UNIQUE INDEX "ReminderDelivery_subscriptionId_localDate_reminderHour_key"
    ON "ReminderDelivery"("subscriptionId", "localDate", "reminderHour");

ALTER TABLE "PushSubscription"
    ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReminderDelivery"
    ADD CONSTRAINT "ReminderDelivery_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReminderDelivery"
    ADD CONSTRAINT "ReminderDelivery_hour_ok"
    CHECK ("reminderHour" IN (21, 22, 23));

-- Keep both tables inaccessible through Supabase's public Data API.
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderDelivery" ENABLE ROW LEVEL SECURITY;
