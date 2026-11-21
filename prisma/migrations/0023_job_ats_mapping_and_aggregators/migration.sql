-- AlterTable JobApplication
ALTER TABLE public."JobApplication"
  ADD COLUMN IF NOT EXISTS "jobDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "atsMatchScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "atsBreakdownJson" TEXT;
