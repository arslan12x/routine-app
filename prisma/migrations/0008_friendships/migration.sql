CREATE TABLE public."Friendship" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Friendship_requester_not_addressee_check" CHECK ("requesterId" <> "addresseeId"),
  CONSTRAINT "Friendship_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED'))
);

CREATE INDEX "Friendship_requesterId_status_idx"
  ON public."Friendship"("requesterId", "status");
CREATE INDEX "Friendship_addresseeId_status_idx"
  ON public."Friendship"("addresseeId", "status");
CREATE UNIQUE INDEX "Friendship_unordered_pair_key"
  ON public."Friendship" (
    LEAST("requesterId", "addresseeId"),
    GREATEST("requesterId", "addresseeId")
  );

ALTER TABLE public."Friendship"
  ADD CONSTRAINT "Friendship_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Friendship"
  ADD CONSTRAINT "Friendship_addresseeId_fkey"
  FOREIGN KEY ("addresseeId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Friendship" TO authenticated;
ALTER TABLE public."Friendship" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.discoverable_users()
RETURNS TABLE (
  "id" TEXT,
  "name" TEXT,
  "username" TEXT,
  "image" TEXT,
  "displayName" TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT app_user."id", app_user."name", app_user."username", app_user."image", settings."displayName"
  FROM public."User" AS app_user
  JOIN public."Member" AS member ON member."userId" = app_user."id"
  JOIN public."Organization" AS organization ON organization."id" = member."organizationId"
  LEFT JOIN public."UserSettings" AS settings ON settings."userId" = app_user."id"
  WHERE app_user."banned" = false
    AND organization."slug" = 'routine-workspace'
    AND app_user."id" <> auth.uid()::text
$$;
REVOKE ALL ON FUNCTION public.discoverable_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discoverable_users() TO authenticated;

CREATE POLICY "friendship_participant_select"
  ON public."Friendship"
  FOR SELECT
  TO authenticated
  USING (
    "requesterId" = (SELECT auth.uid()::text)
    OR "addresseeId" = (SELECT auth.uid()::text)
  );

CREATE POLICY "friendship_requester_insert"
  ON public."Friendship"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "requesterId" = (SELECT auth.uid()::text)
    AND "status" = 'PENDING'
  );

CREATE POLICY "friendship_addressee_update"
  ON public."Friendship"
  FOR UPDATE
  TO authenticated
  USING (
    "addresseeId" = (SELECT auth.uid()::text)
    AND "status" = 'PENDING'
  )
  WITH CHECK (
    "addresseeId" = (SELECT auth.uid()::text)
    AND "status" = 'ACCEPTED'
  );

CREATE POLICY "friendship_addressee_decline"
  ON public."Friendship"
  FOR DELETE
  TO authenticated
  USING (
    "addresseeId" = (SELECT auth.uid()::text)
    AND "status" = 'PENDING'
  );

CREATE FUNCTION public.prevent_friendship_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."requesterId" IS DISTINCT FROM OLD."requesterId"
    OR NEW."addresseeId" IS DISTINCT FROM OLD."addresseeId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Friendship identity fields cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Friendship_identity_immutable"
  BEFORE UPDATE ON public."Friendship"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_friendship_identity_change();

-- Keep the existing organization-admin model aligned with Better Auth's global
-- admin role so workspace administrators retain global leaderboard access.
UPDATE public."User" AS app_user
SET "role" = 'admin'
WHERE EXISTS (
  SELECT 1
  FROM public."Member" AS member
  JOIN public."Organization" AS organization
    ON organization."id" = member."organizationId"
  WHERE member."userId" = app_user."id"
    AND organization."slug" = 'routine-workspace'
    AND member."role" IN ('owner', 'admin')
);
