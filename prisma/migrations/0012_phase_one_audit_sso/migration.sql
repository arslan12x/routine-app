CREATE TABLE public."AuditLog" (
  "id" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_timestamp_idx" ON public."AuditLog"("timestamp");
CREATE INDEX "AuditLog_organizationId_timestamp_idx" ON public."AuditLog"("organizationId", "timestamp");
CREATE INDEX "AuditLog_actorId_timestamp_idx" ON public."AuditLog"("actorId", "timestamp");
CREATE INDEX "AuditLog_targetUserId_timestamp_idx" ON public."AuditLog"("targetUserId", "timestamp");

ALTER TABLE public."AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES public."User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."AuditLog"
  ADD CONSTRAINT "AuditLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE public."SsoProvider" (
  "id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "oidcConfig" TEXT,
  "samlConfig" TEXT,
  "userId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "organizationId" TEXT,
  "domain" TEXT NOT NULL,
  CONSTRAINT "ssoProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ssoProvider_providerId_key" ON public."SsoProvider"("providerId");
CREATE INDEX "ssoProvider_userId_idx" ON public."SsoProvider"("userId");
CREATE INDEX "ssoProvider_organizationId_idx" ON public."SsoProvider"("organizationId");
CREATE INDEX "ssoProvider_domain_idx" ON public."SsoProvider"("domain");

ALTER TABLE public."SsoProvider"
  ADD CONSTRAINT "ssoProvider_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."SsoProvider"
  ADD CONSTRAINT "ssoProvider_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SsoProvider" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."AuditLog", public."SsoProvider" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."AuditLog", public."SsoProvider" TO authenticated;

CREATE FUNCTION public.current_user_is_workspace_admin(workspace_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Member"
    WHERE "userId" = auth.uid()::text
      AND "organizationId" = workspace_id
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_workspace_admin(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_workspace_admin(TEXT) TO authenticated;

CREATE POLICY "audit_log_admin_read"
  ON public."AuditLog"
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_workspace_admin("AuditLog"."organizationId")
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."AuditLog" FROM authenticated;

CREATE POLICY "sso_provider_admin_access"
  ON public."SsoProvider"
  FOR SELECT
  TO authenticated
  USING (
    "organizationId" IS NOT NULL
    AND
    public.current_user_is_workspace_admin("SsoProvider"."organizationId")
  );

CREATE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog records are immutable';
END;
$$;

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON public."AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON public."AuditLog"
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_audit_log_mutation();
