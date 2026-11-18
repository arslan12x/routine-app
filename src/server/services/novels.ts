import { ApiError } from "@/lib/api";
import { systemDb } from "@/lib/db";
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

const CURATED_NOVELS = [
  {
    externalId: "1342",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    genre: "Romance",
    coverUrl: "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/1342.html.images",
    description: "The classic romantic clash between opinionated Elizabeth Bennet and haughty Mr. Darcy in 19th-century England.",
    language: "en",
  },
  {
    externalId: "84",
    title: "Frankenstein",
    author: "Mary Wollstonecraft Shelley",
    genre: "Gothic",
    coverUrl: "https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/84.html.images",
    description: "A scientist discovers the secret of imparting life to inanimate matter, with terrifying consequences.",
    language: "en",
  },
  {
    externalId: "64317",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    genre: "Fiction",
    coverUrl: "https://www.gutenberg.org/cache/epub/64317/pg64317.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/64317.html.images",
    description: "A portrait of the Jazz Age exploring ambition, obsession, and the elusive American Dream in 1920s Long Island.",
    language: "en",
  },
  {
    externalId: "1661",
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    genre: "Mystery",
    coverUrl: "https://www.gutenberg.org/cache/epub/1661/pg1661.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/1661.html.images",
    description: "Twelve of the master detective Sherlock Holmes and Dr. Watson's most brilliant early crime investigations.",
    language: "en",
  },
  {
    externalId: "345",
    title: "Dracula",
    author: "Bram Stoker",
    genre: "Gothic",
    coverUrl: "https://www.gutenberg.org/cache/epub/345/pg345.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/345.html.images",
    description: "The quintessential vampire novel chronicling Count Dracula's attempt to move from Transylvania to England.",
    language: "en",
  },
  {
    externalId: "35",
    title: "The Time Machine",
    author: "H. G. Wells",
    genre: "Science Fiction",
    coverUrl: "https://www.gutenberg.org/cache/epub/35/pg35.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/35.html.images",
    description: "A Victorian scientist invents a machine that transports him to the far distant year of 802,701 AD.",
    language: "en",
  },
  {
    externalId: "120",
    title: "Treasure Island",
    author: "Robert Louis Stevenson",
    genre: "Adventure",
    coverUrl: "https://www.gutenberg.org/cache/epub/120/pg120.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/120.html.images",
    description: "Jim Hawkins embarks on a high-seas adventure in search of buried pirate treasure, facing Long John Silver.",
    language: "en",
  },
  {
    externalId: "4363",
    title: "Beyond Good and Evil",
    author: "Friedrich Nietzsche",
    genre: "Philosophy",
    coverUrl: "https://www.gutenberg.org/cache/epub/4363/pg4363.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/4363.html.images",
    description: "Nietzsche's critique of traditional Western morality, philosophy, and truth.",
    language: "en",
  },
  {
    externalId: "11",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    genre: "Adventure",
    coverUrl: "https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/11.html.images",
    description: "A young girl falls down a rabbit hole into a subterranean fantasy world populated by peculiar anthropomorphic creatures.",
    language: "en",
  },
  {
    externalId: "174",
    title: "The Picture of Dorian Gray",
    author: "Oscar Wilde",
    genre: "Gothic",
    coverUrl: "https://www.gutenberg.org/cache/epub/174/pg174.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/174.html.images",
    description: "A decadent young man trades his soul so that his portrait ages while he retains youthful beauty.",
    language: "en",
  },
  {
    externalId: "98",
    title: "A Tale of Two Cities",
    author: "Charles Dickens",
    genre: "Fiction",
    coverUrl: "https://www.gutenberg.org/cache/epub/98/pg98.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/98.html.images",
    description: "Set in London and Paris before and during the French Revolution, depicting themes of resurrection and self-sacrifice.",
    language: "en",
  },
  {
    externalId: "5200",
    title: "The Metamorphosis",
    author: "Franz Kafka",
    genre: "Fiction",
    coverUrl: "https://www.gutenberg.org/cache/epub/5200/pg5200.cover.medium.jpg",
    readUrl: "https://www.gutenberg.org/ebooks/5200.html.images",
    description: "Gregor Samsa wakes one morning to find himself transformed into a monstrous verminous insect.",
    language: "en",
  },
];

let seeded = false;
async function ensureSeedCatalog() {
  if (seeded) return;
  const count = await systemDb.novelCatalog.count();
  if (count === 0) {
    for (const item of CURATED_NOVELS) {
      if (!isValidNovelRedirectUrl(item.readUrl)) continue;
      await systemDb.novelCatalog.upsert({
        where: { externalId: item.externalId },
        create: item,
        update: item,
      });
    }
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

export async function listNovels(userId?: string, genre?: string, search?: string): Promise<NovelView[]> {
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
      ? systemDb.userReadingSession.findMany({
          where: { userId },
          select: { novelId: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const sessionMap = new Map<string, "READING" | "COMPLETED">();
  for (const s of sessions) {
    sessionMap.set(s.novelId, s.status as "READING" | "COMPLETED");
  }

  return novels.map((n) => ({
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

  const now = new Date();
  const session = await systemDb.userReadingSession.upsert({
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
  });

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
