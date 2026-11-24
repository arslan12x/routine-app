import { requireUser } from "@/lib/auth/session";
import { systemDb, withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { getHalfChapterForNovel } from "@/server/services/novel-reader";
import { reconcileActiveReadingSessions } from "@/server/services/novels";
import { todayIn } from "@/lib/domain/dates";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, fields: error.fields } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Novel Read API] Error", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to load novel content" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const url = new URL(request.url);

    const novel = await systemDb.novelCatalog.findUnique({
      where: { id },
    });
    if (!novel) {
      throw new ApiError(404, "NOT_FOUND", "Novel not found");
    }

    // Auto-Heal & Strict Single-Active-Novel Lock Guard
    const activeOther = await withUserDb(user.id, async (tx) => {
      await reconcileActiveReadingSessions(tx, user.id);
      return tx.userReadingSession.findFirst({
        where: {
          userId: user.id,
          status: "READING",
          novelId: { not: id },
        },
        include: { novel: { select: { id: true, title: true } } },
      });
    });

    if (activeOther) {
      throw new ApiError(
        409,
        "ACTIVE_NOVEL_LOCKED",
        `You already have an active novel in progress: "${activeOther.novel.title}". Complete it to unlock other novels.`,
        {
          activeNovelId: activeOther.novel.id,
          activeNovelTitle: activeOther.novel.title,
        }
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

    const chapterParam = url.searchParams.get("chapter");
    const halfParam = url.searchParams.get("half");

    const chapterNumber = chapterParam ? parseInt(chapterParam, 10) : session.currentChapter || 1;
    const half = (halfParam === "2" ? 2 : halfParam === "1" ? 1 : session.currentHalf === 2 ? 2 : 1) as 1 | 2;

    const halfChapter = await getHalfChapterForNovel(id, chapterNumber, half);
    const todayLocalDate = todayIn(user.timezone);
    const passedToday = session.lastQuizPassedDate === todayLocalDate;

    return Response.json(
      {
        novel: {
          id: novel.id,
          title: novel.title,
          author: novel.author,
          genre: novel.genre,
          coverUrl: novel.coverUrl,
        },
        session: {
          currentChapter: session.currentChapter,
          currentHalf: session.currentHalf,
          lastQuizPassedDate: session.lastQuizPassedDate,
          passedToday,
        },
        halfChapter,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
