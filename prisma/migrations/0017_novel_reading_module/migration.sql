-- CreateEnum
CREATE TYPE "ReadingSessionStatus" AS ENUM ('READING', 'COMPLETED');

-- CreateTable
CREATE TABLE public."NovelCatalog" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "genre" TEXT,
    "coverUrl" TEXT,
    "readUrl" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE public."UserReadingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "status" "ReadingSessionStatus" NOT NULL DEFAULT 'READING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UserReadingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NovelCatalog_externalId_key" ON public."NovelCatalog"("externalId");
CREATE INDEX "NovelCatalog_genre_idx" ON public."NovelCatalog"("genre");
CREATE INDEX "NovelCatalog_title_idx" ON public."NovelCatalog"("title");

-- CreateIndex
CREATE UNIQUE INDEX "UserReadingSession_userId_novelId_key" ON public."UserReadingSession"("userId", "novelId");
CREATE INDEX "UserReadingSession_userId_status_idx" ON public."UserReadingSession"("userId", "status");
CREATE INDEX "UserReadingSession_novelId_idx" ON public."UserReadingSession"("novelId");

-- AddForeignKey
ALTER TABLE public."UserReadingSession" ADD CONSTRAINT "UserReadingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."UserReadingSession" ADD CONSTRAINT "UserReadingSession_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES public."NovelCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE public."NovelCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserReadingSession" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."NovelCatalog", public."UserReadingSession" FROM PUBLIC, anon;
GRANT SELECT ON TABLE public."NovelCatalog" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."UserReadingSession" TO authenticated;

DROP POLICY IF EXISTS "novel_catalog_select" ON public."NovelCatalog";
CREATE POLICY "novel_catalog_select"
  ON public."NovelCatalog"
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_reading_session_owner" ON public."UserReadingSession";
CREATE POLICY "user_reading_session_owner"
  ON public."UserReadingSession"
  FOR ALL
  TO authenticated
  USING ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'))
  WITH CHECK ("userId" = (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));
