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
