-- CreateTable
CREATE TABLE IF NOT EXISTS public."UserResume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "skillsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS public."Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "hrEmail" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "description" TEXT,
    "location" TEXT,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS public."JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobUrl" TEXT,
    "hrEmail" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'TO_APPLY',
    "appliedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "emailThreadId" TEXT,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "logs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserResume_userId_key" ON public."UserResume"("userId");
CREATE INDEX IF NOT EXISTS "UserResume_userId_idx" ON public."UserResume"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Company_category_lastRefreshedAt_idx" ON public."Company"("category", "lastRefreshedAt");
CREATE INDEX IF NOT EXISTS "Company_name_idx" ON public."Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobApplication_userId_companyId_jobTitle_key" ON public."JobApplication"("userId", "companyId", "jobTitle");
CREATE INDEX IF NOT EXISTS "JobApplication_userId_stage_idx" ON public."JobApplication"("userId", "stage");
CREATE INDEX IF NOT EXISTS "JobApplication_stage_nextActionAt_idx" ON public."JobApplication"("stage", "nextActionAt");
CREATE INDEX IF NOT EXISTS "JobApplication_userId_createdAt_idx" ON public."JobApplication"("userId", "createdAt");

-- AddForeignKeys
DO $$ BEGIN
  ALTER TABLE public."UserResume" ADD CONSTRAINT "UserResume_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public."JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public."JobApplication" ADD CONSTRAINT "JobApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enable RLS
ALTER TABLE public."UserResume" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobApplication" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."UserResume", public."Company", public."JobApplication" FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."UserResume", public."Company", public."JobApplication" TO authenticated;

-- Policies
DROP POLICY IF EXISTS "user_resume_owner" ON public."UserResume";
CREATE POLICY "user_resume_owner" ON public."UserResume"
  FOR ALL TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "company_authenticated_access" ON public."Company";
CREATE POLICY "company_authenticated_access" ON public."Company"
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "job_application_owner" ON public."JobApplication";
CREATE POLICY "job_application_owner" ON public."JobApplication"
  FOR ALL TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));
