-- CreateTable
CREATE TABLE IF NOT EXISTS public."BlogPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'Professional',
    "targetAudience" TEXT NOT NULL DEFAULT 'General',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS public."BlogDayContent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtopicsJson" JSONB NOT NULL,
    "markdownContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogDayContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS public."UserIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUsername" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS public."FinanceBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "monthlyLimit" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthYear" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS public."FinanceExpense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogPlan_userId_createdAt_idx" ON public."BlogPlan"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlogDayContent_planId_dayNumber_key" ON public."BlogDayContent"("planId", "dayNumber");
CREATE INDEX IF NOT EXISTS "BlogDayContent_planId_dayNumber_idx" ON public."BlogDayContent"("planId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserIntegration_userId_provider_key" ON public."UserIntegration"("userId", "provider");
CREATE INDEX IF NOT EXISTS "UserIntegration_userId_provider_idx" ON public."UserIntegration"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceBudget_userId_category_monthYear_key" ON public."FinanceBudget"("userId", "category", "monthYear");
CREATE INDEX IF NOT EXISTS "FinanceBudget_userId_monthYear_idx" ON public."FinanceBudget"("userId", "monthYear");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceExpense_userId_spentAt_idx" ON public."FinanceExpense"("userId", "spentAt");
CREATE INDEX IF NOT EXISTS "FinanceExpense_userId_category_idx" ON public."FinanceExpense"("userId", "category");

-- AddForeignKeys
DO $$ BEGIN
  ALTER TABLE public."BlogPlan" ADD CONSTRAINT "BlogPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public."BlogDayContent" ADD CONSTRAINT "BlogDayContent_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."BlogPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public."UserIntegration" ADD CONSTRAINT "UserIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public."FinanceBudget" ADD CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public."FinanceExpense" ADD CONSTRAINT "FinanceExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enable RLS
ALTER TABLE public."BlogPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BlogDayContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FinanceBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FinanceExpense" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."BlogPlan", public."BlogDayContent", public."UserIntegration", public."FinanceBudget", public."FinanceExpense" FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."BlogPlan", public."BlogDayContent", public."UserIntegration", public."FinanceBudget", public."FinanceExpense" TO authenticated;

-- Policies
DROP POLICY IF EXISTS "blog_plan_owner" ON public."BlogPlan";
CREATE POLICY "blog_plan_owner" ON public."BlogPlan"
  FOR ALL TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "blog_day_content_owner" ON public."BlogDayContent";
CREATE POLICY "blog_day_content_owner" ON public."BlogDayContent"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."BlogPlan" bp WHERE bp.id = "BlogDayContent"."planId" AND bp."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')))
  WITH CHECK (EXISTS (SELECT 1 FROM public."BlogPlan" bp WHERE bp.id = "BlogDayContent"."planId" AND bp."userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub')));

DROP POLICY IF EXISTS "user_integration_owner" ON public."UserIntegration";
CREATE POLICY "user_integration_owner" ON public."UserIntegration"
  FOR ALL TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "finance_budget_owner" ON public."FinanceBudget";
CREATE POLICY "finance_budget_owner" ON public."FinanceBudget"
  FOR ALL TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

DROP POLICY IF EXISTS "finance_expense_owner" ON public."FinanceExpense";
CREATE POLICY "finance_expense_owner" ON public."FinanceExpense"
  FOR ALL TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));
