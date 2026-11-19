"use client";

import { useEffect, useState } from "react";
import { Check, Flame, Globe, Loader2, RefreshCw, Zap } from "lucide-react";
import { Button, Card, inputCls } from "@/components/ui";
import { toast } from "sonner";
import { triggerLightImpact, triggerSuccessNotification } from "@/lib/haptics";

export default function DuolingoIntegrationCard() {
  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] = useState<string | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [xpToday, setXpToday] = useState<number | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadIntegration();
  }, []);

  async function loadIntegration() {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations/duolingo");
      if (res.ok) {
        const data = await res.json();
        if (data.integration?.externalUsername) {
          setUsername(data.integration.externalUsername);
          setInitialUsername(data.integration.externalUsername);
          const meta = data.integration.metadata as { streak?: number; xpGainedToday?: number } | null;
          setStreak(meta?.streak ?? null);
          setXpToday(meta?.xpGainedToday ?? null);
          setLastSynced(data.integration.lastSyncedAt ?? null);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAndSync(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

    triggerLightImpact();
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/duolingo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        triggerSuccessNotification();
        setInitialUsername(data.username);
        setStreak(data.streak ?? 0);
        setXpToday(data.xpGainedToday ?? 0);
        setLastSynced(data.lastSyncedAt);
        toast.success(
          `Duolingo account @${data.username} mapped! Streak: ${data.streak}d · ${data.xpGainedToday} XP today.`
        );
      } else {
        toast.error(data.error?.message || "Failed to verify Duolingo username");
      }
    } catch {
      toast.error("Could not connect to Duolingo API");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4 border border-border p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Globe size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Duolingo Account Sync</h2>
            <p className="text-xs text-muted">
              Auto-verifies daily language lessons and syncs streaks with your routine tasks.
            </p>
          </div>
        </div>
        {initialUsername && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check size={12} strokeWidth={3} /> Connected
          </span>
        )}
      </div>

      <form onSubmit={handleSaveAndSync} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Duolingo Username (Public Profile)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="e.g. duo_learner"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
            />
            <Button
              type="submit"
              disabled={saving || !username.trim()}
              className="flex shrink-0 items-center gap-1.5 py-1.5 px-3 text-xs"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{initialUsername ? "Update & Sync" : "Connect"}</span>
            </Button>
          </div>
        </div>

        {initialUsername && streak !== null && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted">
            <span className="flex items-center gap-1 text-foreground font-medium">
              <Flame size={14} className="text-brand" /> {streak} day streak
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <Zap size={14} /> {xpToday ?? 0} XP gained today
            </span>
            {lastSynced && (
              <>
                <span>•</span>
                <span>Synced: {new Date(lastSynced).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
