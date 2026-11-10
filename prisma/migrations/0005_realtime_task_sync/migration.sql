-- Authenticated Realtime clients may read only their own rows. Prisma continues
-- using the server-side database connection; this does not replace server checks.
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskLog" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public."Task", public."TaskLog" TO authenticated;

DROP POLICY IF EXISTS "realtime_select_own_tasks" ON public."Task";
CREATE POLICY "realtime_select_own_tasks"
  ON public."Task"
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid())::text = "userId");

DROP POLICY IF EXISTS "realtime_select_own_task_logs" ON public."TaskLog";
CREATE POLICY "realtime_select_own_task_logs"
  ON public."TaskLog"
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid())::text = "userId");

-- Only permit listening on the private topic whose suffix is the JWT subject.
DROP POLICY IF EXISTS "routine_realtime_select_own_topic" ON realtime.messages;
CREATE POLICY "routine_realtime_select_own_topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid())::text = split_part(realtime.topic(), ':', 2));

-- Postgres Changes cannot safely filter DELETE payloads by owner. Send a minimal
-- user-scoped private Broadcast for deletes instead, without publishing row data.
CREATE OR REPLACE FUNCTION public.broadcast_routine_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    pg_catalog.jsonb_build_object('table', TG_TABLE_NAME, 'operation', 'DELETE'),
    'task-change',
    'user:' || OLD."userId",
    true
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "TaskLog_realtime_delete" ON public."TaskLog";
CREATE TRIGGER "TaskLog_realtime_delete"
  AFTER DELETE ON public."TaskLog"
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_routine_delete();

DROP TRIGGER IF EXISTS "Task_realtime_delete" ON public."Task";
CREATE TRIGGER "Task_realtime_delete"
  AFTER DELETE ON public."Task"
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_routine_delete();

-- Enable Postgres Changes for inserts and updates on these two tables. Do not
-- subscribe to DELETE through Postgres Changes: its owner filter is not secure.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime' AND puballtables
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Task'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Task";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime' AND puballtables
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'TaskLog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."TaskLog";
  END IF;
END;
$$;
