import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth/session";
import { systemDb, withUserDb } from "@/lib/db";
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

  // Strict Single-Active-Novel Lock Guard
  const activeOther = await withUserDb(user.id, (tx) =>
    tx.userReadingSession.findFirst({
      where: {
        userId: user.id,
        status: "READING",
        novelId: { not: id },
      },
      include: { novel: { select: { id: true, title: true } } },
    })
  );

  if (activeOther) {
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
          currentChapter: 1,
          currentHalf: 1,
          lastQuizPassedDate: null,
          passedToday: false,
        }}
        initialHalfChapter={{
          chapterNumber: 1,
          totalChapters: 1,
          half: 1,
          title: "Novel Locked",
          content: "",
        }}
        lockedActiveNovel={{
          id: activeOther.novel.id,
          title: activeOther.novel.title,
        }}
      />
    );
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
