"use client";
import { Flame, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Ring } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { getSupabaseClient } from "@/lib/supabase";
import type { DayItem, DayView, TaskView } from "@/server/services/tasks";
import DayTasks, { applyLocal } from "./DayTasks";
import TaskDialog from "./TaskDialog";

const TOKEN_REFRESH_MS = 45 * 60 * 1_000;

export default function TasksScreen({ initial, userId }: { initial: DayView; userId: string }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ task: TaskView | null } | null>(null);
  const refreshInFlight = useRef(false);
  const writesInFlight = useRef(0);
  const localChanges = useRef(0);

  const refetch = useCallback(async () => {
    if (refreshInFlight.current || writesInFlight.current > 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    refreshInFlight.current = true;
    const version = localChanges.current;
    try {
      const next = await api<DayView>("/api/today");
      if (version !== localChanges.current) return;
      setData((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    } catch (e) {
      setError(e instanceof Error ? `Could not refresh tasks: ${e.message}` : "Could not refresh tasks.");
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null = null;
    let connecting = false;
    let tokenTimer: number | undefined;
    let refreshTimer: number | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void refetch();
      }, 100);
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
          .subscribe((status) => {
            if (!active) return;
            if (status === "SUBSCRIBED") {
              setError(null);
              scheduleRefresh();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              setError("Live sync disconnected. Check your connection or reload the page.");
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
      window.removeEventListener("online", refreshWhenActive);
      document.removeEventListener("focusout", refreshWhenActive);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (channel) void getSupabaseClient().removeChannel(channel);
    };
  }, [refetch, userId]);

  const onProgress = useCallback(async (item: DayItem, value: number) => {
    setError(null);
    localChanges.current += 1;
    writesInFlight.current += 1;
    setData((d) => applyLocal(d, item.id, value)); // optimistic
    let saved = false;
    try {
      await api(`/api/tasks/${item.id}/progress`, { method: "PUT", body: JSON.stringify({ date: data.date, value }) });
      saved = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setData((current) => applyLocal(current, item.id, item.value));
    } finally {
      writesInFlight.current -= 1;
    }
    if (saved) void refetch(); // refresh derived streaks without delaying the interaction
  }, [data.date, refetch]);

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

      {data.mandatory.length + data.extra.length === 0 && data.others.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <div className="display text-xl font-semibold">Start your routine</div>
          <p className="mt-1 text-sm text-muted">Add a mandatory task (like 10 pages of reading) to begin a streak.</p>
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
