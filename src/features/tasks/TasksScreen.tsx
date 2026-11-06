"use client";
import { Flame, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Card, Ring } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { useVisibleInterval } from "@/lib/useVisibleInterval";
import type { DayItem, DayView, TaskView } from "@/server/services/tasks";
import DayTasks, { applyLocal } from "./DayTasks";
import TaskDialog from "./TaskDialog";

const SYNC_INTERVAL_MS = 5_000;

export default function TasksScreen({ initial }: { initial: DayView }) {
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
    } catch {
      // Keep the last known state and retry on the next poll or when the app returns online.
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useVisibleInterval(refetch, SYNC_INTERVAL_MS);

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
