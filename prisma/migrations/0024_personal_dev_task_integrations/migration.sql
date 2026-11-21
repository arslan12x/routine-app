-- AlterTable Task
ALTER TABLE public."Task"
  ADD COLUMN IF NOT EXISTS "personalDevType" TEXT;

CREATE INDEX IF NOT EXISTS "Task_userId_personalDevType_idx" ON public."Task"("userId", "personalDevType");

-- AlterTable UserReadingSession
ALTER TABLE public."UserReadingSession"
  ADD COLUMN IF NOT EXISTS "currentChapter" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "currentHalf" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastQuizPassedDate" TEXT;
