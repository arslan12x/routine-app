export const ALLOWED_NOVEL_HOSTS = [
  "www.gutenberg.org",
  "gutenberg.org",
  "openlibrary.org",
  "archive.org",
  "www.archive.org",
  "standardebooks.org",
  "www.standardebooks.org",
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
