-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE public."Challenge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "Category",
    "unit" TEXT,
    "target" DOUBLE PRECISION NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE public."ChallengeParticipant" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Challenge_organizationId_status_idx" ON public."Challenge"("organizationId", "status");
CREATE INDEX "Challenge_startDate_endDate_idx" ON public."Challenge"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeParticipant_challengeId_userId_key" ON public."ChallengeParticipant"("challengeId", "userId");
CREATE INDEX "ChallengeParticipant_challengeId_idx" ON public."ChallengeParticipant"("challengeId");
CREATE INDEX "ChallengeParticipant_userId_idx" ON public."ChallengeParticipant"("userId");

-- AddForeignKey
ALTER TABLE public."Challenge" ADD CONSTRAINT "Challenge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Challenge" ADD CONSTRAINT "Challenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE public."ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES public."Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE public."Challenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChallengeParticipant" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Challenge", public."ChallengeParticipant" TO authenticated;

-- Helper function to check if current user is member of a workspace
CREATE OR REPLACE FUNCTION public.current_user_is_member_of_workspace(org_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Member"
    WHERE "organizationId" = org_id
      AND "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_member_of_workspace(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_member_of_workspace(TEXT) TO authenticated;

-- Policies for Challenge
CREATE POLICY "challenge_workspace_member_select"
  ON public."Challenge"
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_member_of_workspace("organizationId"));

CREATE POLICY "challenge_workspace_member_insert"
  ON public."Challenge"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "creatorId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND public.current_user_is_member_of_workspace("organizationId")
  );

CREATE POLICY "challenge_creator_or_admin_update"
  ON public."Challenge"
  FOR UPDATE
  TO authenticated
  USING (
    "creatorId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    OR public.current_user_is_workspace_admin("organizationId")
  );

-- Policies for ChallengeParticipant
CREATE POLICY "challenge_participant_select"
  ON public."ChallengeParticipant"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."Challenge" c
      WHERE c."id" = "challengeId"
        AND public.current_user_is_member_of_workspace(c."organizationId")
    )
  );

CREATE POLICY "challenge_participant_insert"
  ON public."ChallengeParticipant"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    AND EXISTS (
      SELECT 1 FROM public."Challenge" c
      WHERE c."id" = "challengeId"
        AND public.current_user_is_member_of_workspace(c."organizationId")
    )
  );

CREATE POLICY "challenge_participant_delete"
  ON public."ChallengeParticipant"
  FOR DELETE
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));
