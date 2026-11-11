-- Enterprise tenancy. Run `npm run db:prepare-enterprise` first to replace
-- every legacy synthetic email with the owner's real email address.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."User"
    WHERE "email" LIKE '%@users.routine.invalid'
  ) THEN
    RAISE EXCEPTION 'Legacy synthetic emails remain; run db:prepare-enterprise with a complete LEGACY_ACCOUNT_EMAILS mapping before this migration';
  END IF;
END $$;

ALTER TABLE public."User"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "banReason" TEXT,
  ADD COLUMN "banExpires" TIMESTAMP(3);

ALTER TABLE public."Session"
  ADD COLUMN "activeOrganizationId" TEXT,
  ADD COLUMN "impersonatedBy" TEXT;

CREATE TABLE public."Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logo" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."Member" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."Invitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inviterId" TEXT NOT NULL,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON public."Organization"("slug");
CREATE UNIQUE INDEX "Member_userId_key" ON public."Member"("userId");
CREATE UNIQUE INDEX "Member_organizationId_userId_key" ON public."Member"("organizationId", "userId");
CREATE INDEX "Member_organizationId_idx" ON public."Member"("organizationId");
CREATE INDEX "Invitation_organizationId_idx" ON public."Invitation"("organizationId");
CREATE INDEX "Invitation_email_idx" ON public."Invitation"("email");

ALTER TABLE public."Member"
  ADD CONSTRAINT "Member_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Member"
  ADD CONSTRAINT "Member_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Invitation"
  ADD CONSTRAINT "Invitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Invitation"
  ADD CONSTRAINT "Invitation_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO public."Organization" ("id", "name", "slug")
VALUES ('routine-default-workspace', 'Routine Workspace', 'routine-workspace');

UPDATE public."User" AS app_user
SET "banned" = allowlist."revokedAt" IS NOT NULL,
    "banReason" = CASE WHEN allowlist."revokedAt" IS NOT NULL THEN 'Access revoked before organization migration' END
FROM public."AllowedEmail" AS allowlist
WHERE lower(app_user."email") = lower(allowlist."email");

INSERT INTO public."Member" ("id", "organizationId", "userId", "role")
SELECT
  'legacy-' || app_user."id",
  'routine-default-workspace',
  app_user."id",
  CASE allowlist."role"::TEXT WHEN 'ADMIN' THEN 'admin' ELSE 'member' END
FROM public."User" AS app_user
JOIN public."AllowedEmail" AS allowlist ON lower(app_user."email") = lower(allowlist."email");

DROP TABLE public."AllowedEmail";
DROP TYPE IF EXISTS public."Role";

-- These tables are accessed by the trusted Prisma server adapter. Keep browser
-- Data API access denied; normal member CRUD remains protected by existing
-- owner-scoped policies on the user-owned tables.
ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Invitation" ENABLE ROW LEVEL SECURITY;
