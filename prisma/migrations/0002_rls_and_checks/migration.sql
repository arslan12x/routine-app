-- CHECK constraints and RLS that Prisma cannot express in schema.prisma.

ALTER TABLE "TaskVersion" ADD CONSTRAINT "TaskVersion_target_pos" CHECK ("target" > 0);
ALTER TABLE "TaskVersion" ADD CONSTRAINT "TaskVersion_weekly_extra_only"
  CHECK ("recurrence" <> 'WEEKLY_TOTAL' OR "isMandatory" = false);
ALTER TABLE "TaskVersion" ADD CONSTRAINT "TaskVersion_weekdays_ok"
  CHECK ("recurrence" <> 'WEEKDAYS' OR cardinality("weekdays") > 0);
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_value_nonneg" CHECK ("value" >= 0);

-- Supabase exposes the public schema through its Data API (PostgREST).
-- Deny-all RLS (no policies) blocks that path. Prisma connects as a privileged
-- role and bypasses RLS, so the app itself is unaffected.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AllowedEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskLog" ENABLE ROW LEVEL SECURITY;
