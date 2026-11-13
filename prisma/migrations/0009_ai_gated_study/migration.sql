CREATE TYPE "StudySubject" AS ENUM ('DSA', 'FDA', 'JAVA', 'SYSTEM_DESIGN');

ALTER TABLE public."Task"
  ADD COLUMN "isAiGated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiSubject" "StudySubject";

ALTER TABLE public."Task"
  ADD CONSTRAINT "Task_ai_study_settings_check"
  CHECK (
    ("isAiGated" = false AND "aiSubject" IS NULL)
    OR ("isAiGated" = true AND "aiSubject" IS NOT NULL)
  );

CREATE FUNCTION public.prevent_ai_study_gate_removal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."isAiGated" AND NOT NEW."isAiGated" THEN
    RAISE EXCEPTION 'AI-guided completion cannot be disabled after it is enabled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Task_ai_study_gate_immutable"
  BEFORE UPDATE ON public."Task"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ai_study_gate_removal();

-- A normal authenticated client may read its task logs but cannot write
-- progress for an AI-gated task. The server's verified study completion path
-- sets a transaction-local claim while still using the authenticated role.
DROP POLICY "app_task_log_owner" ON public."TaskLog";

CREATE POLICY "app_task_log_select_owner"
  ON public."TaskLog"
  FOR SELECT
  TO authenticated
  USING (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  );

CREATE POLICY "app_task_log_insert_owner"
  ON public."TaskLog"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
        AND (
          NOT owner_task."isAiGated"
          OR (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'ai_study_completion') = 'true'
        )
    )
  );

CREATE POLICY "app_task_log_update_owner"
  ON public."TaskLog"
  FOR UPDATE
  TO authenticated
  USING (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
        AND (
          NOT owner_task."isAiGated"
          OR (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'ai_study_completion') = 'true'
        )
    )
  )
  WITH CHECK (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
        AND (
          NOT owner_task."isAiGated"
          OR (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'ai_study_completion') = 'true'
        )
    )
  );

CREATE POLICY "app_task_log_delete_owner"
  ON public."TaskLog"
  FOR DELETE
  TO authenticated
  USING (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM public."Task" AS owner_task
      WHERE owner_task."id" = "TaskLog"."taskId"
        AND owner_task."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
        AND (
          NOT owner_task."isAiGated"
          OR (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'ai_study_completion') = 'true'
        )
    )
  );
