DO $$
BEGIN
  IF to_regclass('public."ssoProvider"') IS NOT NULL
     AND to_regclass('public."SsoProvider"') IS NULL THEN
    ALTER TABLE public."ssoProvider" RENAME TO "SsoProvider";
  ELSIF to_regclass('public."ssoProvider"') IS NOT NULL
     AND to_regclass('public."SsoProvider"') IS NOT NULL THEN
    RAISE EXCEPTION 'Both ssoProvider and SsoProvider exist; reconcile SSO provider data before applying this migration';
  ELSIF to_regclass('public."SsoProvider"') IS NULL THEN
    RAISE EXCEPTION 'Neither ssoProvider nor SsoProvider exists; apply the SSO schema migration before this migration';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."SsoProvider"'::regclass
      AND conname = 'ssoProvider_organizationId_fkey'
  ) THEN
    ALTER TABLE public."SsoProvider"
      ADD CONSTRAINT "ssoProvider_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END;
$$;
