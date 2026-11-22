"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Check, ExternalLink, Library, Lock, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Empty, Skeleton, inputCls } from "@/components/ui";
import { cn } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import { NOVEL_GENRES, type NovelGenre } from "@/lib/domain/novels";
import type { ActiveNovelInfo, NovelView } from "@/server/services/novels";

interface ReadingSessionItem {
  id: string;
  status: "READING" | "COMPLETED";
  startedAt: string;
  lastReadAt: string;
  completedAt: string | null;
  novel: {
    id: string;
    title: string;
    author: string | null;
    genre: string | null;
    coverUrl: string | null;
    readUrl: string;
  };
}

export default function NovelsScreen({
  initialNovels,
  initialActiveNovel,
  initialSessions,
}: {
  initialNovels: NovelView[];
  initialActiveNovel?: ActiveNovelInfo | null;
  initialSessions: ReadingSessionItem[];
}) {
  const [novels, setNovels] = useState<NovelView[]>(initialNovels);
  const [activeNovel, setActiveNovel] = useState<ActiveNovelInfo | null>(
    initialActiveNovel || null
  );
  const [sessions, setSessions] = useState<ReadingSessionItem[]>(initialSessions);
  const [selectedGenre, setSelectedGenre] = useState<NovelGenre>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedGenre !== "All") params.set("genre", selectedGenre);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      api<{ novels: NovelView[]; activeNovel: ActiveNovelInfo | null }>(`/api/novels?${params.toString()}`)
        .then((res) => {
          if (active) {
            setNovels(res.novels);
            setActiveNovel(res.activeNovel);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            toast.error("Could not fetch novels. Please try again.");
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedGenre, searchQuery]);

  const router = useRouter();

  async function handleReadFreeNow(novel: NovelView) {
    if (activeNovel && activeNovel.id !== novel.id) {
      toast.error(`You are currently reading "${activeNovel.title}". Complete it first to unlock other novels.`);
      return;
    }
    router.push(`/novels/${novel.id}`);
  }

  async function handleToggleStatus(novelId: string, targetStatus: "READING" | "COMPLETED") {
    setUpdatingId(novelId);
    try {
      await api<{ session: unknown; readUrl: string }>(`/api/novels/${novelId}/session`, {
        method: "POST",
        body: JSON.stringify({ status: targetStatus }),
      });
      const [novelsRes, sessionsRes] = await Promise.all([
        api<{ novels: NovelView[]; activeNovel: ActiveNovelInfo | null }>("/api/novels"),
        api<{ sessions: ReadingSessionItem[] }>("/api/novels/sessions"),
      ]);
      setNovels(novelsRes.novels);
      setActiveNovel(novelsRes.activeNovel);
      setSessions(sessionsRes.sessions);
      toast.success(targetStatus === "COMPLETED" ? "Marked as completed!" : "Marked as reading!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update reading status.";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      <div className="mt-2">
        <div className="flex items-center gap-2 text-brand">
          <Library size={22} aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider">Public Domain Library</span>
        </div>
        <h1 className="display text-3xl font-semibold">Free Classic Novels</h1>
        <p className="mt-1 text-sm text-muted">
          Browse, read, and track free public-domain classics hosted on Project Gutenberg and verified archives.
        </p>
      </div>

      {/* Prominent Active Novel Lock Banner */}
      {activeNovel && (
        <Card className="mt-6 p-4 sm:p-5 border-brand/40 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="rounded-xl bg-brand/20 p-2.5 text-brand shrink-0">
                <BookOpen size={24} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                    Currently Reading
                  </span>
                  <span className="text-xs text-muted flex items-center gap-1 font-medium">
                    <Lock size={12} className="text-amber-500" /> Single-Active Book Locked
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-fg truncate mt-1">
                  {activeNovel.title}
                </h2>
                <p className="text-xs text-muted truncate">
                  {activeNovel.author || "Classic Novel"} · Chapter {activeNovel.currentChapter} (Part {activeNovel.currentHalf} of 2)
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push(`/novels/${activeNovel.id}`)}
              className="shrink-0 bg-brand text-brandfg hover:bg-brand/90 font-semibold shadow-xs text-xs px-4 h-9"
            >
              <BookOpen size={14} className="mr-1.5" /> Continue Reading
            </Button>
          </div>
        </Card>
      )}

      {sessions.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles size={16} className="text-brand" aria-hidden />
              My Reading Sessions ({sessions.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <Card key={s.id} className="flex items-center gap-3 p-3 border-brand/20 bg-card">
                <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-soft">
                  {s.novel.coverUrl && !failedCovers[s.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.novel.coverUrl}
                      alt={s.novel.title}
                      onError={() => setFailedCovers((prev) => ({ ...prev, [s.id]: true }))}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs font-bold text-muted bg-soft">
                      {s.novel.title.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{s.novel.title}</div>
                  <div className="truncate text-xs text-muted">{s.novel.author ?? "Unknown author"}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        s.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {s.status === "COMPLETED" ? "Completed" : "Reading"}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/novels/${s.novel.id}`}
                  className="rounded-lg p-2 text-muted hover:bg-soft hover:text-brand transition"
                  title="Continue reading in-app"
                >
                  <BookOpen size={16} aria-hidden />
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Genre Filters & Search */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Search title or author…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(inputCls, "pl-9 text-sm")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Genre filters">
          {NOVEL_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              role="tab"
              aria-selected={selectedGenre === genre}
              onClick={() => setSelectedGenre(genre)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                selectedGenre === genre
                  ? "bg-brand text-brandfg shadow-sm"
                  : "bg-soft text-muted hover:bg-soft/80 hover:text-foreground",
              )}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Novels Grid */}
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : novels.length === 0 ? (
        <div className="mt-8">
          <Empty
            title="No novels found"
            hint="Try searching for another title, author, or select a different genre."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {novels.map((novel) => {
            const isOtherLocked = Boolean(activeNovel && activeNovel.id !== novel.id);
            return (
              <Card
                key={novel.id}
                className={cn(
                  "flex flex-col justify-between overflow-hidden p-4 transition-all hover:border-brand/40 hover:shadow-md",
                  isOtherLocked && "opacity-80 border-border/60"
                )}
              >
                <div>
                  <div className="relative mb-3 aspect-[2/3] w-full overflow-hidden rounded-xl bg-soft shadow-inner">
                    {novel.coverUrl && !failedCovers[novel.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={novel.coverUrl}
                        alt={novel.title}
                        onError={() => setFailedCovers((prev) => ({ ...prev, [novel.id]: true }))}
                        className={cn(
                          "h-full w-full object-cover transition duration-300",
                          !isOtherLocked && "hover:scale-105"
                        )}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-soft to-card border border-border/40">
                        <div className="rounded-full bg-brand/10 p-3 text-brand mb-2">
                          <BookOpen size={28} aria-hidden />
                        </div>
                        <div className="text-sm font-semibold text-foreground line-clamp-2">{novel.title}</div>
                        <div className="text-xs text-muted mt-1">{novel.author ?? "Classic"}</div>
                        {novel.genre && (
                          <span className="mt-2 rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-muted">
                            {novel.genre}
                          </span>
                        )}
                      </div>
                    )}
                    {novel.sessionStatus && (
                      <span
                        className={cn(
                          "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md shadow-sm",
                          novel.sessionStatus === "COMPLETED"
                            ? "bg-emerald-500/90 text-white"
                            : "bg-amber-500/90 text-white",
                        )}
                      >
                        {novel.sessionStatus === "COMPLETED" ? "Completed" : "Reading"}
                      </span>
                    )}
                    {isOtherLocked && (
                      <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center p-3 text-center">
                        <div className="rounded-full bg-card/90 p-2.5 text-muted shadow-sm border border-border/60">
                          <Lock size={20} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-muted">
                      {novel.genre ?? "Classic"}
                    </span>
                  </div>

                  <h3 className="display font-semibold text-foreground line-clamp-1 text-base">{novel.title}</h3>
                  <p className="text-xs text-muted truncate">{novel.author ?? "Unknown"}</p>
                  
                  {isOtherLocked && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      <Lock size={12} className="shrink-0" />
                      <span className="truncate">Finish &ldquo;{activeNovel?.title}&rdquo; to unlock</span>
                    </div>
                  )}

                  {novel.description && (
                    <p className="mt-2 text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                      {novel.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
                  {isOtherLocked ? (
                    <Button
                      disabled
                      className="flex-1 min-h-9 px-3 text-xs gap-1.5 opacity-60 cursor-not-allowed bg-soft text-muted border border-border"
                    >
                      <Lock size={13} aria-hidden />
                      Locked
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void handleReadFreeNow(novel)}
                      className="flex-1 min-h-9 px-3 text-xs gap-1.5 shadow-sm"
                    >
                      <BookOpen size={14} aria-hidden />
                      Read Free Now
                    </Button>
                  )}

                  {novel.sessionStatus === "READING" ? (
                    <Button
                      variant="outline"
                      className="min-h-9 px-2.5 text-xs text-emerald-600 hover:text-emerald-700"
                      title="Mark as Completed"
                      disabled={updatingId === novel.id}
                      onClick={() => void handleToggleStatus(novel.id, "COMPLETED")}
                    >
                      <Check size={14} aria-hidden />
                    </Button>
                  ) : novel.sessionStatus === "COMPLETED" ? (
                    <Button
                      variant="outline"
                      className="min-h-9 px-2.5 text-xs text-muted hover:text-foreground"
                      title="Mark as Reading"
                      disabled={updatingId === novel.id || Boolean(activeNovel && activeNovel.id !== novel.id)}
                      onClick={() => void handleToggleStatus(novel.id, "READING")}
                    >
                      <BookOpen size={14} aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
