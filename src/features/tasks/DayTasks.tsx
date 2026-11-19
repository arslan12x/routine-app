"use client";
import { Check, Flame, Globe, Loader2, Pencil, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Empty, inputCls } from "@/components/ui";
import { cn, fmtNum } from "@/lib/cn";
import { triggerLightImpact, triggerSuccessNotification } from "@/lib/haptics";
import type { DayItem, DayView, TaskView } from "@/server/services/tasks";
import { catLabel } from "./constants";
import { toast } from "sonner";

/** Optimistic local update; the server value replaces it right after the request completes (or fails). */
export function applyLocal(d: DayView, id: string, value: number): DayView {
  const upd = (i: DayItem): DayItem => {
    if (i.id !== id) return i;
    const v = i.completionType === "BOOLEAN" ? (value > 0 ? 1 : 0) : value;
    const weekly = i.recurrence === "WEEKLY_TOTAL";
    const weekSum = weekly ? Math.max(0, (i.weekSum ?? 0) - i.value + v) : null;
    const basis = weekly ? weekSum ?? 0 : v;
    return { ...i, value: v, weekSum, done: basis >= i.target, progress: Math.min(1, basis / i.target) };
  };
  const mandatory = d.mandatory.map(upd), extra = d.extra.map(upd);
  const daily = [...mandatory, ...extra].filter((i) => i.recurrence !== "WEEKLY_TOTAL");
  return {
    ...d, mandatory, extra,
    completed: daily.filter((i) => i.done).length,
    progressPct: daily.length ? Math.round((daily.reduce((a, i) => a + i.progress, 0) / daily.length) * 100) : 0,
  };
}

function Row({ item, editable, onProgress, onStudy, onEdit }: {
  item: DayItem;
  editable: boolean;
  onProgress: (i: DayItem, v: number) => void;
  onStudy?: (i: DayItem) => void;
  onEdit?: (t: TaskView) => void;
}) {
  const measurable = item.completionType === "MEASURABLE";
  const weekly = item.recurrence === "WEEKLY_TOTAL";
  const isDuolingo = item.title.toLowerCase().includes("duolingo") || (item.description?.toLowerCase().includes("duolingo") ?? false);
  const [syncing, setSyncing] = useState(false);
  const [duoWarning, setDuoWarning] = useState<string | null>(null);
  const [duoAccount, setDuoAccount] = useState<{ username: string; streak?: number; xpGainedToday?: number } | null>(null);
  const [showDuoModal, setShowDuoModal] = useState(false);
  const [duoInput, setDuoInput] = useState("");
  const [savingDuo, setSavingDuo] = useState(false);
  const [draft, setDraft] = useState(item.value ? String(item.value) : "");
  useEffect(() => setDraft(item.value ? String(item.value) : ""), [item.value]);

  useEffect(() => {
    if (!isDuolingo) return;
    fetch("/api/integrations/duolingo")
      .then((res) => res.json())
      .then((data) => {
        if (data?.integration?.externalUsername) {
          const meta = data.integration.metadata as { streak?: number; xpGainedToday?: number } | null;
          setDuoAccount({
            username: data.integration.externalUsername,
            streak: meta?.streak,
            xpGainedToday: meta?.xpGainedToday,
          });
          setDuoInput(data.integration.externalUsername);
        }
      })
      .catch(() => {});
  }, [isDuolingo]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || Number.isNaN(n) || n < 0) return setDraft(item.value ? String(item.value) : "");
    if (n !== item.value) onProgress(item, n);
  };
  const unit = item.unit ?? "";

  const handleDuolingoSync = async (overrideUsername?: string) => {
    const targetUsername = overrideUsername ?? duoAccount?.username;
    if (!targetUsername) {
      setShowDuoModal(true);
      return;
    }
    setSyncing(true);
    setDuoWarning(null);
    try {
      const res = await fetch("/api/integrations/duolingo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername, taskId: item.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setDuoAccount({
          username: data.username,
          streak: data.streak,
          xpGainedToday: data.xpGainedToday,
        });
        if (data.completedToday) {
          triggerSuccessNotification();
          onProgress(item, item.target || 1);
          toast.success(`Duolingo lesson verified for @${data.username}! Task marked complete.`);
        } else {
          toast.info(`@${data.username} has not completed lessons today (0 XP). Practice on Duolingo, then sync!`);
        }
        if (data.warning) {
          setDuoWarning(data.warning);
        }
      } else {
        if (data.error?.code === "MISSING_USERNAME") {
          setShowDuoModal(true);
        } else {
          setDuoWarning(data.error?.message || "Could not sync Duolingo.");
        }
      }
    } catch {
      setDuoWarning("Unable to connect to Duolingo. You can mark this task complete manually.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveDuoAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duoInput.trim()) return;
    setSavingDuo(true);
    try {
      await handleDuolingoSync(duoInput.trim());
      setShowDuoModal(false);
    } finally {
      setSavingDuo(false);
    }
  };
  return (
    <Card className={cn("flex items-start gap-3 p-3", item.done && "border-ok/40")}>
      <button
        disabled={!editable || (item.isAiGated && !onStudy)}
        aria-pressed={item.done}
        aria-label={item.isAiGated
          ? `${item.done ? "Review" : "Start"} AI study: ${item.title}`
          : `${item.done ? "Mark incomplete" : "Mark complete"}: ${item.title}`}
        onClick={() => {
          if (item.isAiGated) {
            onStudy?.(item);
            return;
          }
          triggerLightImpact();
          onProgress(item, measurable ? (item.value >= item.target ? 0 : item.target) : item.value > 0 ? 0 : 1);
        }}
        className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2 transition", item.done ? "pop border-ok bg-ok text-white" : "border-border bg-card", !editable && "opacity-50")}
      >
        {item.done && <Check size={20} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("font-medium leading-snug", item.done && "text-muted line-through")}>{item.title}</div>
          {onEdit && <button onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-soft"><Pencil size={15} /></button>}
        </div>
        <div className="text-xs text-muted">
          {catLabel(item.category)}
          {weekly && ` · Week: ${fmtNum(item.weekSum ?? 0)} / ${fmtNum(item.target)} ${unit}`.trimEnd()}
          {item.description && ` · ${item.description}`}
        </div>
        {isDuolingo && (
          <div className="mt-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <Globe size={14} className="text-emerald-500 shrink-0" />
                {duoAccount ? (
                  <span>Duolingo: @{duoAccount.username}</span>
                ) : (
                  <span>Duolingo Not Connected</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {duoAccount ? (
                  <>
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => handleDuolingoSync()}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                    >
                      <RefreshCw size={11} className={cn(syncing && "animate-spin")} />
                      <span>{syncing ? "Syncing..." : "Sync"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDuoModal(true)}
                      title="Change username"
                      className="rounded-md p-1 text-muted hover:bg-soft"
                    >
                      <Pencil size={12} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDuoModal(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-700 transition"
                  >
                    <span>Connect Account</span>
                  </button>
                )}
              </div>
            </div>

            {duoAccount && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                {typeof duoAccount.streak === "number" && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Flame size={12} className="text-brand" /> {duoAccount.streak}d streak
                  </span>
                )}
                {typeof duoAccount.xpGainedToday === "number" && (
                  <span>• {duoAccount.xpGainedToday} XP gained today</span>
                )}
              </div>
            )}

            {duoWarning && (
              <div className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300 border border-amber-500/20">
                <span>⚠️ {duoWarning}</span>
              </div>
            )}
          </div>
        )}
        {showDuoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <Card className="w-full max-w-sm border border-border bg-card p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Globe size={18} className="text-emerald-500" />
                  <h3 className="font-bold text-sm">Connect Duolingo Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDuoModal(false)}
                  className="rounded-lg p-1 text-muted hover:bg-soft"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleSaveDuoAccount} className="mt-3 space-y-3">
                <p className="text-xs text-muted">
                  Enter your public Duolingo username. We will map your routine to this account and auto-sync your completed lessons.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Duolingo Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. duo_learner"
                    value={duoInput}
                    onChange={(e) => setDuoInput(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDuoModal(false)}
                    className="py-1 px-3 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingDuo || !duoInput.trim()}
                    className="flex items-center gap-1.5 py-1 px-3 text-xs"
                  >
                    {savingDuo && <Loader2 size={13} className="animate-spin" />}
                    <span>Save & Sync</span>
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
        {measurable && (
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full transition-all", item.done ? "bg-ok" : "bg-brand")} style={{ width: `${item.progress * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <input
                inputMode="decimal" disabled={!editable} value={draft} placeholder="0" aria-label={`Progress for ${item.title}`}
                onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-10 w-24 rounded-lg border border-border bg-bg px-2 tabular-nums"
              />
              <span className="text-muted">{weekly ? "today" : `/ ${fmtNum(item.target)} ${unit}`}{!weekly && ` · ${Math.round(item.progress * 100)}%`}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DayTasks({ data, onProgress, onStudy, onEdit }: {
  data: DayView;
  onProgress: (i: DayItem, v: number) => void;
  onStudy?: (i: DayItem) => void;
  onEdit?: (t: TaskView) => void;
}) {
  const section = (title: string, items: DayItem[], hint: string) => (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-lg font-semibold">{title}</h2><span className="text-xs text-muted">{hint}</span></div>
      <div className="space-y-2">
        {items.length ? items.map((i) => <Row key={i.id} item={i} editable={data.editable} onProgress={onProgress} onStudy={onStudy} onEdit={onEdit} />) : <Empty title={`No ${title.toLowerCase()} today`} />}
      </div>
    </section>
  );
  return (
    <>
      {!data.editable && <p className="mt-4 rounded-xl bg-soft p-3 text-sm text-muted">This day is older than 7 days, so it&apos;s read-only.</p>}
      {section("Mandatory", data.mandatory, `${data.mandatory.filter((i) => i.done).length}/${data.mandatory.length} · decides your streak`)}
      {section("Extra", data.extra, "optional")}
    </>
  );
}
