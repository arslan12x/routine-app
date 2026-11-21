-- AlterTable Company
ALTER TABLE public."Company"
  ADD COLUMN IF NOT EXISTS "atsProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "atsSlug" TEXT;

-- AlterTable JobApplication
ALTER TABLE public."JobApplication"
  ADD COLUMN IF NOT EXISTS "externalJobId" TEXT,
  ADD COLUMN IF NOT EXISTS "jobLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isLiveVerified" BOOLEAN NOT NULL DEFAULT true;
