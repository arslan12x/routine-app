export const ALLOWED_NOVEL_HOSTS = [
  "www.gutenberg.org",
  "gutenberg.org",
  "openlibrary.org",
  "covers.openlibrary.org",
  "archive.org",
  "www.archive.org",
  "standardebooks.org",
  "www.standardebooks.org",
  "wikisource.org",
  "en.wikisource.org",
] as const;

export const NOVEL_GENRES = [
  "All",
  "Fiction",
  "Mystery",
  "Science Fiction",
  "Gothic",
  "Adventure",
  "Romance",
  "Philosophy",
] as const;

export type NovelGenre = (typeof NOVEL_GENRES)[number];

export function isValidNovelRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_NOVEL_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/**
 * Pure domain check: A user can open or read a novel if:
 * 1. They have no active session (or none currently in READING status), OR
 * 2. Their active READING session is for this exact novel.
 *
 * If they have an active session for a DIFFERENT novel in READING status, opening is blocked.
 */
export function canOpenNovel(
  activeSession: { novelId: string; status: string } | null,
  targetNovelId: string
): boolean {
  if (!activeSession) return true;
  if (activeSession.status !== "READING") return true;
  return activeSession.novelId === targetNovelId;
}

export interface NovelReadingSessionLike {
  id?: string;
  novelId: string;
  status: string;
  lastReadAt: string | Date;
  startedAt?: string | Date;
}

/**
 * Deduplicates multiple active reading sessions for a user, keeping only the single
 * most recently read session (ordered by lastReadAt DESC, startedAt DESC).
 */
export function resolveCanonicalActiveReadingSession<T extends NovelReadingSessionLike>(
  sessions: T[]
): { canonical: T | null; stale: T[] } {
  const readingSessions = sessions
    .filter((s) => s.status === "READING")
    .slice()
    .sort((a, b) => {
      const aRead = new Date(a.lastReadAt).getTime();
      const bRead = new Date(b.lastReadAt).getTime();
      if (bRead !== aRead) return bRead - aRead;
      const aStart = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bStart = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return bStart - aStart;
    });

  if (readingSessions.length === 0) {
    return { canonical: null, stale: [] };
  }

  const [canonical, ...stale] = readingSessions;
  return { canonical, stale };
}

