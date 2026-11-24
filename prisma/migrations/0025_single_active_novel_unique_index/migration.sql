-- 1. Deduplicate any existing users who have multiple status = 'READING' rows in UserReadingSession,
-- keeping only the single most recently read row per userId.
DELETE FROM public."UserReadingSession"
WHERE "status" = 'READING'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("userId") "id"
    FROM public."UserReadingSession"
    WHERE "status" = 'READING'
    ORDER BY "userId", "lastReadAt" DESC, "startedAt" DESC
  );

-- 2. Partial unique index to enforce database-level guarantee of at most one active READING novel per user
CREATE UNIQUE INDEX IF NOT EXISTS "UserReadingSession_one_active_reading_per_user_idx"
ON public."UserReadingSession" ("userId")
WHERE "status" = 'READING';
