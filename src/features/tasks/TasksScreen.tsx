"use client";
import dynamic from "next/dynamic";
import { Flame, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Ring, Skeleton } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { getSupabaseClient } from "@/lib/supabase";
import { cacheToday, enqueueProgress, getCachedToday, syncOfflineProgress } from "@/lib/offline-store";
import { triggerSuccessNotification } from "@/lib/haptics";
import type { DayItem, DayView, TaskView } from "@/server/services/tasks";
import { toast } from "sonner";
import DayTasks, { applyLocal } from "./DayTasks";
import EmptyDashboardState from "./EmptyDashboardState";

const TaskDialog = dynamic(() => import("./TaskDialog"), {
  ssr: false,
  loading: () => (
    <div aria-label="Loading task editor" aria-busy="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full space-y-4 rounded-t-3xl bg-bg p-5 sm:max-w-lg sm:rounded-3xl">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </div>
  ),
});

const TOKEN_REFRESH_MS = 45 * 60 * 1_000;

export default function TasksScreen({ initial, userId }: { initial: DayView; userId: string }) {
  const [data, setData] = useState(initial);
  const dataRef = useRef(initial);
  const isMandatoryComplete =
    initial.date === initial.today &&
    initial.mandatory.length > 0 &&
    initial.mandatory.every((item) => item.done);
  const previousMandatoryComplete = useRef(isMandatoryComplete);
  const celebratedDates = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ task: TaskView | null } | null>(null);
  const refreshInFlight = useRef(false);
  const writesInFlight = useRef(0);
  const localChanges = useRef(0);
  const taskWriteVersions = useRef(new Map<string, number>());
  const taskWriteQueues = useRef(new Map<string, Promise<void>>());

  const updateData = useCallback((update: (current: DayView) => DayView) => {
    const next = update(dataRef.current);
    dataRef.current = next;
    setData(next);
  }, []);

  const mandatoryComplete =
    data.date === data.today &&
    data.mandatory.length > 0 &&
    data.mandatory.every((item) => item.done);

  useEffect(() => {
    const wasComplete = previousMandatoryComplete.current;
    previousMandatoryComplete.current = mandatoryComplete;
    if (!wasComplete && mandatoryComplete && !celebratedDates.current.has(data.date)) {
      celebratedDates.current.add(data.date);
      triggerSuccessNotification();
      toast.success("All mandatory tasks complete! Great work.");
      void import("canvas-confetti")
        .then(({ default: confetti }) => {
          confetti({
            particleCount: 120,
            spread: 75,
            origin: { y: 0.65 },
            colors: ["#e24b24", "#f4b942", "#38a169", "#4b8bf4"],
          });
        })
        .catch((error: unknown) => {
          console.error("[Tasks] Could not load completion confetti", error);
        });
    }
  }, [data.date, mandatoryComplete]);

  const loadToday = useCallback(async () => {
    try {
      const next = await api<DayView>("/api/today");
      await cacheToday(userId, next);
      return next;
    } catch (error) {
      if (navigator.onLine && !(error instanceof TypeError)) throw error;
      const cached = await getCachedToday(userId);
      if (cached) return cached;
      throw error;
    }
  }, [userId]);

  const refetch = useCallback(async () => {
    if (refreshInFlight.current || writesInFlight.current > 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    refreshInFlight.current = true;
    const version = localChanges.current;
    try {
      const next = await loadToday();
      if (version !== localChanges.current) return;
      updateData((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    } catch (e) {
      setError(e instanceof Error ? `Could not refresh tasks: ${e.message}` : "Could not refresh tasks.");
    } finally {
      refreshInFlight.current = false;
    }
  }, [loadToday, updateData]);

  const refreshAfterCreate = useCallback(async () => {
    localChanges.current += 1;
    const next = await loadToday();
    updateData(() => next);
  }, [loadToday, updateData]);

  useEffect(() => {
    void cacheToday(userId, initial).catch((error: unknown) => {
      console.error("[Offline] Could not cache today's tasks", error);
    });
  }, [initial, userId]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null = null;
    let connecting = false;
    let tokenTimer: number | undefined;
    let refreshTimer: number | undefined;
    let fallbackTimer: number | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void refetch();
      }, 100);
    };

    const startFallbackRefresh = () => {
      if (fallbackTimer === undefined) {
        fallbackTimer = window.setInterval(() => void refetch(), 30_000);
      }
    };

    const stopFallbackRefresh = () => {
      if (fallbackTimer !== undefined) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = undefined;
      }
    };

    const refreshToken = async () => {
      const { token } = await api<{ token: string }>("/api/realtime-token");
      if (!active) return;
      await getSupabaseClient().realtime.setAuth(token);
    };

    const connect = async () => {
      if (connecting || channel) return;
      connecting = true;
      try {
        const client = getSupabaseClient();
        await refreshToken();
        if (!active) return;

        channel = client
          .channel(`user:${userId}`, { config: { private: true } })
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "TaskLog",
            filter: `userId=eq.${userId}`,
          }, scheduleRefresh)
          .on("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "TaskLog",
            filter: `userId=eq.${userId}`,
          }, scheduleRefresh)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "Task",
            filter: `userId=eq.${userId}`,
          }, scheduleRefresh)
          .on("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "Task",
            filter: `userId=eq.${userId}`,
          }, scheduleRefresh)
          .on("broadcast", { event: "task-change" }, scheduleRefresh)
          .subscribe((status, err) => {
            if (!active) return;
            if (status === "SUBSCRIBED") {
              stopFallbackRefresh();
              setError(null);
              scheduleRefresh();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              console.error("[Realtime] Task sync subscription failed", {
                status,
                message: err?.message,
                error: err,
              });
              startFallbackRefresh();
              scheduleRefresh();
              const details = err?.message ? ` ${err.message}` : "";
              setError(`Live sync ${status === "TIMED_OUT" ? "timed out" : "disconnected"}.${details} Sync will retry automatically.`);
            }
          });

        tokenTimer = window.setInterval(() => {
          void refreshToken().catch((e: unknown) => {
            if (active) setError(e instanceof Error ? `Live sync authorization failed: ${e.message}` : "Live sync authorization failed.");
          });
        }, TOKEN_REFRESH_MS);
      } finally {
        connecting = false;
      }
    };

    const refreshWhenActive = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      scheduleRefresh();
      const refresh = channel ? refreshToken() : connect();
      void refresh.catch((e: unknown) => {
        if (active) setError(e instanceof Error ? `Live sync authorization failed: ${e.message}` : "Live sync authorization failed.");
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshWhenActive();
    };
    window.addEventListener("online", refreshWhenActive);
    document.addEventListener("focusout", refreshWhenActive);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void connect().catch((e: unknown) => {
      if (active) setError(e instanceof Error ? `Live sync could not start: ${e.message}` : "Live sync could not start.");
    });

    return () => {
      active = false;
      if (tokenTimer !== undefined) window.clearInterval(tokenTimer);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      stopFallbackRefresh();
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("focusout", refreshWhenActive);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (channel) void getSupabaseClient().removeChannel(channel);
    };
  }, [refetch, userId]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      if (!navigator.onLine) return;
      try {
        await syncOfflineProgress(userId);
        if (active) void refetch();
      } catch (error) {
        console.error("[Offline] Could not sync queued task progress", error);
        if (active) toast.error("Some offline progress could not sync. It will be retried.");
      }
    };

    window.addEventListener("online", sync);
    void sync();
    return () => {
      active = false;
      window.removeEventListener("online", sync);
    };
  }, [refetch, userId]);

  const onProgress = useCallback((item: DayItem, value: number) => {
    setError(null);
    const currentItem = [...dataRef.current.mandatory, ...dataRef.current.extra].find(({ id }) => id === item.id);
    const previousValue = currentItem?.value ?? item.value;
    const version = (taskWriteVersions.current.get(item.id) ?? 0) + 1;
    taskWriteVersions.current.set(item.id, version);
    localChanges.current += 1;
    writesInFlight.current += 1;
    updateData((current) => applyLocal(current, item.id, value));

    const previousWrite = taskWriteQueues.current.get(item.id) ?? Promise.resolve();
    const write = previousWrite
      .catch(() => undefined)
      .then(async () => {
        if (!navigator.onLine) {
          await enqueueProgress(userId, { taskId: item.id, date: dataRef.current.date, value });
          toast.info("Saved offline. Progress will sync when you're back online.");
          return;
        }

        await syncOfflineProgress(userId);
        try {
          await api(`/api/tasks/${item.id}/progress`, { method: "PUT", body: JSON.stringify({ date: dataRef.current.date, value }) });
        } catch (error) {
          if (error instanceof TypeError || !navigator.onLine) {
            await enqueueProgress(userId, { taskId: item.id, date: dataRef.current.date, value });
            toast.info("Saved offline. Progress will sync when you're back online.");
            return;
          }
          throw error;
        }
      });
    taskWriteQueues.current.set(item.id, write);

    void write.catch(() => {
      toast.error("Failed to save progress. Please try again.");
      if (taskWriteVersions.current.get(item.id) === version) {
        updateData((current) => applyLocal(current, item.id, previousValue));
      }
    }).finally(() => {
      writesInFlight.current -= 1;
      if (taskWriteQueues.current.get(item.id) === write) taskWriteQueues.current.delete(item.id);
      if (writesInFlight.current === 0 && navigator.onLine) void refetch();
    });
  }, [refetch, updateData, userId]);

  return (
    <>
      <div className="mt-2">
        <h1 className="display text-3xl font-semibold">{data.greeting}!</h1>
        <p className="text-muted">{data.longDate}</p>
      </div>
      <Card className="mt-4 flex items-center gap-4">
        <Ring pct={data.progressPct} label="Today's progress" />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted">Today&apos;s progress</div>
          <div className="text-lg font-semibold tabular-nums">{data.completed} / {data.total} tasks</div>
          <div className="text-sm text-muted">{Math.max(0, data.total - data.completed)} remaining</div>
        </div>
        <div className="text-center">
          <Flame className="mx-auto text-brand" size={26} aria-hidden />
          <div className="display text-2xl font-semibold tabular-nums">{data.streak}</div>
          <div className="text-xs text-muted">day streak</div>
        </div>
      </Card>

      {error && <p role="alert" className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">{error}</p>}

      {!data.hasTasks ? (
        <EmptyDashboardState onCreated={refreshAfterCreate} />
      ) : data.mandatory.length + data.extra.length === 0 && data.others.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <div className="display text-xl font-semibold">No tasks scheduled today</div>
          <p className="mt-1 text-sm text-muted">Add or adjust a task to build your routine.</p>
        </div>
      ) : (
        <DayTasks data={data} onProgress={onProgress} onEdit={(t) => setDialog({ task: t })} />
      )}

      {data.others.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-muted">Not scheduled today</h2>
          <div className="space-y-2">
            {data.others.map((t) => (
              <button key={t.id} onClick={() => setDialog({ task: t })} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-card px-3 text-left text-sm">
                <span>{t.title}</span><span className="text-xs text-muted">{t.isMandatory ? "Mandatory" : "Extra"} · Edit</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button onClick={() => setDialog({ task: null })} aria-label="Add task"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 grid size-14 place-items-center rounded-full bg-brand text-brandfg shadow-lg transition active:scale-95 md:bottom-8 md:right-8">
        <Plus size={26} />
      </button>
      {dialog && <TaskDialog key={dialog.task?.id ?? "new"} task={dialog.task} onClose={() => setDialog(null)} onSaved={refetch} />}
    </>
  );
}
