import { ApiError } from "@/lib/api";
import { systemDb, withUserDb } from "@/lib/db";
import { isValidNovelRedirectUrl } from "@/lib/domain/novels";

export interface NovelView {
  id: string;
  externalId: string | null;
  title: string;
  author: string | null;
  genre: string | null;
  coverUrl: string | null;
  readUrl: string;
  description: string | null;
  language: string;
  sessionStatus: "READING" | "COMPLETED" | null;
}

export interface ActiveNovelInfo {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  currentChapter: number;
  currentHalf: number;
}

export interface ListNovelsResult {
  novels: NovelView[];
  activeNovel: ActiveNovelInfo | null;
}

const CURATED_NOVELS = [
  {
    externalId: "1342",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    genre: "Romance",
    coverUrl: "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/text/single-page",
    description: "The classic romantic clash between opinionated Elizabeth Bennet and haughty Mr. Darcy in 19th-century England.",
    language: "en",
  },
  {
    externalId: "84",
    title: "Frankenstein",
    author: "Mary Wollstonecraft Shelley",
    genre: "Gothic",
    coverUrl: "https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/mary-shelley/frankenstein/text/single-page",
    description: "A scientist discovers the secret of imparting life to inanimate matter, with terrifying consequences.",
    language: "en",
  },
  {
    externalId: "64317",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    genre: "Fiction",
    coverUrl: "https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby/text/single-page",
    description: "A portrait of the Jazz Age exploring ambition, obsession, and the elusive American Dream in 1920s Long Island.",
    language: "en",
  },
  {
    externalId: "1661",
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    genre: "Mystery",
    coverUrl: "https://standardebooks.org/ebooks/arthur-conan-doyle/the-adventures-of-sherlock-holmes/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/arthur-conan-doyle/the-adventures-of-sherlock-holmes/text/single-page",
    description: "Twelve of the master detective Sherlock Holmes and Dr. Watson's most brilliant early crime investigations.",
    language: "en",
  },
  {
    externalId: "345",
    title: "Dracula",
    author: "Bram Stoker",
    genre: "Gothic",
    coverUrl: "https://standardebooks.org/ebooks/bram-stoker/dracula/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/bram-stoker/dracula/text/single-page",
    description: "The quintessential vampire novel chronicling Count Dracula's attempt to move from Transylvania to England.",
    language: "en",
  },
  {
    externalId: "35",
    title: "The Time Machine",
    author: "H. G. Wells",
    genre: "Science Fiction",
    coverUrl: "https://standardebooks.org/ebooks/h-g-wells/the-time-machine/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/h-g-wells/the-time-machine/text/single-page",
    description: "A Victorian scientist invents a machine that transports him to the far distant year of 802,701 AD.",
    language: "en",
  },
  {
    externalId: "120",
    title: "Treasure Island",
    author: "Robert Louis Stevenson",
    genre: "Adventure",
    coverUrl: "https://standardebooks.org/ebooks/robert-louis-stevenson/treasure-island/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/robert-louis-stevenson/treasure-island/text/single-page",
    description: "Jim Hawkins embarks on a high-seas adventure in search of buried pirate treasure, facing Long John Silver.",
    language: "en",
  },
  {
    externalId: "4363",
    title: "Beyond Good and Evil",
    author: "Friedrich Nietzsche",
    genre: "Philosophy",
    coverUrl: "https://covers.openlibrary.org/b/id/12415174-L.jpg",
    readUrl: "https://en.wikisource.org/wiki/Beyond_Good_and_Evil",
    description: "Nietzsche's critique of traditional Western morality, philosophy, and truth.",
    language: "en",
  },
  {
    externalId: "11",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    genre: "Adventure",
    coverUrl: "https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/text/single-page",
    description: "A young girl falls down a rabbit hole into a subterranean fantasy world populated by peculiar anthropomorphic creatures.",
    language: "en",
  },
  {
    externalId: "174",
    title: "The Picture of Dorian Gray",
    author: "Oscar Wilde",
    genre: "Gothic",
    coverUrl: "https://standardebooks.org/ebooks/oscar-wilde/the-picture-of-dorian-gray/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/oscar-wilde/the-picture-of-dorian-gray/text/single-page",
    description: "A decadent young man trades his soul so that his portrait ages while he retains youthful beauty.",
    language: "en",
  },
  {
    externalId: "98",
    title: "A Tale of Two Cities",
    author: "Charles Dickens",
    genre: "Fiction",
    coverUrl: "https://standardebooks.org/ebooks/charles-dickens/a-tale-of-two-cities/downloads/cover-thumbnail.jpg",
    readUrl: "https://standardebooks.org/ebooks/charles-dickens/a-tale-of-two-cities/text/single-page",
    description: "Set in London and Paris before and during the French Revolution, depicting themes of resurrection and self-sacrifice.",
    language: "en",
  },
  {
    externalId: "5200",
    title: "The Metamorphosis",
    author: "Franz Kafka",
    genre: "Fiction",
    coverUrl: "https://covers.openlibrary.org/b/id/14351842-L.jpg",
    readUrl: "https://standardebooks.org/ebooks/franz-kafka/the-metamorphosis/david-wyllie/text/single-page",
    description: "Gregor Samsa wakes one morning to find himself transformed into a monstrous verminous insect.",
    language: "en",
  },
];

let seeded = false;
async function ensureSeedCatalog() {
  if (seeded) return;
  for (const item of CURATED_NOVELS) {
    if (!isValidNovelRedirectUrl(item.readUrl)) continue;
    await systemDb.novelCatalog.upsert({
      where: { externalId: item.externalId },
      create: item,
      update: {
        title: item.title,
        author: item.author,
        genre: item.genre,
        coverUrl: item.coverUrl,
        readUrl: item.readUrl,
        description: item.description,
        language: item.language,
      },
    });
  }
  seeded = true;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: { name: string }[];
  subjects: string[];
  formats: Record<string, string>;
  languages: string[];
}

interface GutendexResponse {
  results: GutendexBook[];
}

export async function fetchFromGutendex(genre?: string, search?: string): Promise<void> {
  const params = new URLSearchParams();
  if (genre && genre !== "All") params.set("topic", genre.toLowerCase());
  if (search && search.trim().length > 0) params.set("search", search.trim());
  params.set("languages", "en");

  try {
    const res = await fetch(`https://gutendex.com/books/?${params.toString()}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return;

    const data = (await res.json()) as GutendexResponse;
    if (!data.results || !Array.isArray(data.results)) return;

    for (const book of data.results.slice(0, 10)) {
      const readUrl = book.formats["text/html"] || `https://www.gutenberg.org/ebooks/${book.id}.html.images`;
      if (!isValidNovelRedirectUrl(readUrl)) continue;

      const authorName = book.authors.map((a) => a.name.split(",").reverse().join(" ").trim()).join(", ") || "Unknown";
      const detectedGenre = genre && genre !== "All"
        ? genre
        : book.subjects.find((s) => s.length < 30) || "Fiction";
      const coverUrl = book.formats["image/jpeg"] || null;

      await systemDb.novelCatalog.upsert({
        where: { externalId: String(book.id) },
        create: {
          externalId: String(book.id),
          title: book.title.slice(0, 200),
          author: authorName.slice(0, 100),
          genre: detectedGenre.slice(0, 50),
          coverUrl,
          readUrl,
          description: book.subjects.slice(0, 3).join(" · ") || null,
          language: book.languages[0] || "en",
        },
        update: {
          readUrl,
          coverUrl: coverUrl ?? undefined,
        },
      });
    }
  } catch (error) {
    console.warn("[Novels] Gutendex query timed out or failed; serving from local catalog", error);
  }
}

export async function listNovels(
  userId?: string,
  genre?: string,
  search?: string
): Promise<ListNovelsResult> {
  await ensureSeedCatalog();

  // If search or specific genre given, attempt live Gutendex fetch to enrich results
  if ((search && search.trim().length > 1) || (genre && genre !== "All")) {
    await fetchFromGutendex(genre, search);
  }

  const whereClause: {
    genre?: { contains: string; mode: "insensitive" };
    OR?: Array<{ title?: { contains: string; mode: "insensitive" }; author?: { contains: string; mode: "insensitive" } }>;
  } = {};

  if (genre && genre !== "All") {
    whereClause.genre = { contains: genre, mode: "insensitive" };
  }

  if (search && search.trim().length > 0) {
    whereClause.OR = [
      { title: { contains: search.trim(), mode: "insensitive" } },
      { author: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  const [novels, sessions] = await Promise.all([
    systemDb.novelCatalog.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    userId
      ? withUserDb(userId, (tx) =>
          tx.userReadingSession.findMany({
            where: { userId },
            include: { novel: true },
          })
        )
      : Promise.resolve([]),
  ]);

  let activeNovel: ActiveNovelInfo | null = null;
  const sessionMap = new Map<string, "READING" | "COMPLETED">();
  for (const s of sessions) {
    sessionMap.set(s.novelId, s.status as "READING" | "COMPLETED");
    if (s.status === "READING" && !activeNovel) {
      activeNovel = {
        id: s.novelId,
        title: s.novel.title,
        author: s.novel.author,
        coverUrl: s.novel.coverUrl,
        currentChapter: s.currentChapter,
        currentHalf: s.currentHalf,
      };
    }
  }

  const novelViews = novels.map((n) => ({
    id: n.id,
    externalId: n.externalId,
    title: n.title,
    author: n.author,
    genre: n.genre,
    coverUrl: n.coverUrl,
    readUrl: n.readUrl,
    description: n.description,
    language: n.language,
    sessionStatus: sessionMap.get(n.id) ?? null,
  }));

  return { novels: novelViews, activeNovel };
}

export async function updateReadingSession(userId: string, novelId: string, status: "READING" | "COMPLETED") {
  const novel = await systemDb.novelCatalog.findUnique({
    where: { id: novelId },
  });

  if (!novel) {
    throw new ApiError(404, "NOT_FOUND", "Novel not found in catalog");
  }

  if (!isValidNovelRedirectUrl(novel.readUrl)) {
    throw new ApiError(400, "INVALID_URL", "This novel's reading URL failed security domain validation.");
  }

  // Strict Single-Active-Novel Lock:
  // If attempting to mark or start as READING, verify no other novel is currently active
  if (status === "READING") {
    const activeOther = await withUserDb(userId, (tx) =>
      tx.userReadingSession.findFirst({
        where: {
          userId,
          status: "READING",
          novelId: { not: novelId },
        },
        include: { novel: { select: { id: true, title: true } } },
      })
    );

    if (activeOther) {
      throw new ApiError(
        409,
        "ACTIVE_NOVEL_LOCKED",
        `You are currently reading "${activeOther.novel.title}". You cannot start another novel until you finish it.`,
        {
          activeNovelId: activeOther.novel.id,
          activeNovelTitle: activeOther.novel.title,
        }
      );
    }
  }

  const now = new Date();
  const session = await withUserDb(userId, (tx) =>
    tx.userReadingSession.upsert({
      where: {
        userId_novelId: {
          userId,
          novelId,
        },
      },
      create: {
        userId,
        novelId,
        status,
        startedAt: now,
        lastReadAt: now,
        completedAt: status === "COMPLETED" ? now : null,
      },
      update: {
        status,
        lastReadAt: now,
        completedAt: status === "COMPLETED" ? now : null,
      },
    })
  );

  return {
    session: {
      id: session.id,
      novelId: session.novelId,
      status: session.status,
      lastReadAt: session.lastReadAt.toISOString(),
      completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    },
    readUrl: novel.readUrl,
  };
}

export async function getUserReadingSessions(userId: string) {
  const sessions = await systemDb.userReadingSession.findMany({
    where: { userId },
    include: {
      novel: true,
    },
    orderBy: { lastReadAt: "desc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    status: s.status,
    startedAt: s.startedAt.toISOString(),
    lastReadAt: s.lastReadAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    novel: {
      id: s.novel.id,
      title: s.novel.title,
      author: s.novel.author,
      genre: s.novel.genre,
      coverUrl: s.novel.coverUrl,
      readUrl: s.novel.readUrl,
    },
  }));
}
