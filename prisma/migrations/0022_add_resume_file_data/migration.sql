-- AlterTable UserResume
ALTER TABLE public."UserResume"
  ADD COLUMN IF NOT EXISTS "fileData" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
