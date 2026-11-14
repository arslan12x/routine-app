CREATE FUNCTION public.current_user_shares_workspace_with(other_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Member" AS current_membership
    JOIN public."Member" AS other_membership
      ON other_membership."organizationId" = current_membership."organizationId"
    WHERE current_membership."userId" = auth.uid()::text
      AND other_membership."userId" = other_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_shares_workspace_with(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_shares_workspace_with(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.discoverable_users()
RETURNS TABLE (
  "id" TEXT,
  "name" TEXT,
  "username" TEXT,
  "image" TEXT,
  "displayName" TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT app_user."id", app_user."name", app_user."username", app_user."image", settings."displayName"
  FROM public."User" AS app_user
  JOIN public."Member" AS member ON member."userId" = app_user."id"
  JOIN public."Member" AS viewer_membership
    ON viewer_membership."organizationId" = member."organizationId"
   AND viewer_membership."userId" = auth.uid()::text
  LEFT JOIN public."UserSettings" AS settings ON settings."userId" = app_user."id"
  WHERE app_user."banned" = false
    AND app_user."id" <> auth.uid()::text
$$;

DROP POLICY "friendship_participant_select" ON public."Friendship";
DROP POLICY "friendship_requester_insert" ON public."Friendship";
DROP POLICY "friendship_addressee_update" ON public."Friendship";
DROP POLICY "friendship_addressee_decline" ON public."Friendship";

CREATE POLICY "friendship_participant_select"
  ON public."Friendship"
  FOR SELECT
  TO authenticated
  USING (
    ("requesterId" = (SELECT auth.uid()::text)
      AND public.current_user_shares_workspace_with("addresseeId"))
    OR
    ("addresseeId" = (SELECT auth.uid()::text)
      AND public.current_user_shares_workspace_with("requesterId"))
  );

CREATE POLICY "friendship_requester_insert"
  ON public."Friendship"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "requesterId" = (SELECT auth.uid()::text)
    AND "status" = 'PENDING'
    AND public.current_user_shares_workspace_with("addresseeId")
  );

CREATE POLICY "friendship_addressee_update"
  ON public."Friendship"
  FOR UPDATE
  TO authenticated
  USING (
    "addresseeId" = (SELECT auth.uid()::text)
    AND "status" = 'PENDING'
    AND public.current_user_shares_workspace_with("requesterId")
  )
  WITH CHECK (
    "addresseeId" = (SELECT auth.uid()::text)
    AND "status" = 'ACCEPTED'
    AND public.current_user_shares_workspace_with("requesterId")
  );

CREATE POLICY "friendship_addressee_decline"
  ON public."Friendship"
  FOR DELETE
  TO authenticated
  USING (
    "addresseeId" = (SELECT auth.uid()::text)
    AND "status" = 'PENDING'
    AND public.current_user_shares_workspace_with("requesterId")
  );
