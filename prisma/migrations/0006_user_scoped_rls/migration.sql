-- Prisma request paths switch to the non-privileged `authenticated` role inside
-- a transaction and set these claims before querying. The Prisma server
-- connection remains privileged only for auth, admin, and scheduled system work.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public."User" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."UserSettings",
  public."Task",
  public."TaskVersion",
  public."TaskLog",
  public."PushSubscription",
  public."ReminderDelivery"
TO authenticated;

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReminderDelivery" ENABLE ROW LEVEL SECURITY;

-- Replace the initial Realtime-only SELECT policies with the common owner
-- policies below; leaving duplicate permissive policies would widen access.
DROP POLICY IF EXISTS "realtime_select_own_tasks" ON public."Task";
DROP POLICY IF EXISTS "realtime_select_own_task_logs" ON public."TaskLog";

DROP POLICY IF EXISTS "app_user_select_self" ON public."User";
CREATE POLICY "app_user_select_self"
  ON public."User"
  FOR SELECT
  TO authenticated
  USING ("id" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "app_user_settings_owner" ON public."UserSettings";
CREATE POLICY "app_user_settings_owner"
  ON public."UserSettings"
  FOR ALL
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "app_task_owner" ON public."Task";
CREATE POLICY "app_task_owner"
  ON public."Task"
  FOR ALL
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "app_task_version_owner" ON public."TaskVersion";
CREATE POLICY "app_task_version_owner"
  ON public."TaskVersion"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskVersion"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskVersion"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  );

DROP POLICY IF EXISTS "app_task_log_owner" ON public."TaskLog";
CREATE POLICY "app_task_log_owner"
  ON public."TaskLog"
  FOR ALL
  TO authenticated
  USING (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  )
  WITH CHECK (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  );

DROP POLICY IF EXISTS "app_push_subscription_owner" ON public."PushSubscription";
CREATE POLICY "app_push_subscription_owner"
  ON public."PushSubscription"
  FOR ALL
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "app_reminder_delivery_owner" ON public."ReminderDelivery";
CREATE POLICY "app_reminder_delivery_owner"
  ON public."ReminderDelivery"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public."PushSubscription" AS owner_subscription
      WHERE owner_subscription."id" = "ReminderDelivery"."subscriptionId"
        AND owner_subscription."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public."PushSubscription" AS owner_subscription
      WHERE owner_subscription."id" = "ReminderDelivery"."subscriptionId"
        AND owner_subscription."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  );
