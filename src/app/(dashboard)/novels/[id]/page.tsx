import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { todayIn } from "@/lib/domain/dates";
import { getHalfChapterForNovel } from "@/server/services/novel-reader";
import NovelReaderScreen from "@/features/novels/NovelReaderScreen";

export default async function NovelReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await pageUser();
  const { id } = await params;

  const novel = await systemDb.novelCatalog.findUnique({
    where: { id },
  });

  if (!novel) {
    notFound();
  }

  let session = await systemDb.userReadingSession.findUnique({
    where: { userId_novelId: { userId: user.id, novelId: id } },
  });

  if (!session) {
    session = await systemDb.userReadingSession.create({
      data: {
        userId: user.id,
        novelId: id,
        currentChapter: 1,
        currentHalf: 1,
      },
    });
  }

  const chapter = session.currentChapter || 1;
  const half = (session.currentHalf === 2 ? 2 : 1) as 1 | 2;
  const halfChapter = await getHalfChapterForNovel(id, chapter, half);

  const todayLocalDate = todayIn(user.timezone);
  const passedToday = session.lastQuizPassedDate === todayLocalDate;

  return (
    <NovelReaderScreen
      novel={{
        id: novel.id,
        title: novel.title,
        author: novel.author,
        genre: novel.genre,
        coverUrl: novel.coverUrl,
      }}
      initialSession={{
        currentChapter: session.currentChapter,
        currentHalf: session.currentHalf,
        lastQuizPassedDate: session.lastQuizPassedDate,
        passedToday,
      }}
      initialHalfChapter={halfChapter}
    />
  );
}
