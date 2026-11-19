CREATE TABLE IF NOT EXISTS public."Achievement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "badgeType" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Achievement_userId_badgeType_key" ON public."Achievement"("userId", "badgeType");
CREATE INDEX IF NOT EXISTS "Achievement_userId_unlockedAt_idx" ON public."Achievement"("userId", "unlockedAt");

DO $$ BEGIN
  ALTER TABLE public."Achievement"
    ADD CONSTRAINT "Achievement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public."CoachReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStartDate" DATE NOT NULL,
  "review" TEXT NOT NULL,
  "actionableTip" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoachReview_userId_weekStartDate_key" ON public."CoachReview"("userId", "weekStartDate");
CREATE INDEX IF NOT EXISTS "CoachReview_userId_createdAt_idx" ON public."CoachReview"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE public."CoachReview"
    ADD CONSTRAINT "CoachReview_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public."Achievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoachReview" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Achievement", public."CoachReview" FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Achievement", public."CoachReview" TO authenticated;

DROP POLICY IF EXISTS "achievement_owner" ON public."Achievement";
CREATE POLICY "achievement_owner"
  ON public."Achievement"
  FOR ALL
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "coach_review_owner" ON public."CoachReview";
CREATE POLICY "coach_review_owner"
  ON public."CoachReview"
  FOR ALL
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));
