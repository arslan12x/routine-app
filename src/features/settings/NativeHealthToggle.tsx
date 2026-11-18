"use client";

import { useEffect, useState } from "react";
import { Activity, Check, RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import {
  fetchTodayHealthMetrics,
  isHealthSyncEnabled,
  requestHealthPermissions,
  setHealthSyncEnabled,
} from "@/lib/native-health";
import { toast } from "sonner";
import { triggerLightImpact } from "@/lib/haptics";

export default function NativeHealthToggle() {
  const [enabled, setEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastMetrics, setLastMetrics] = useState<{ steps: number; workoutMinutes: number } | null>(null);

  useEffect(() => {
    const isEnabled = isHealthSyncEnabled();
    setEnabled(isEnabled);
    if (isEnabled) {
      void fetchTodayHealthMetrics().then((m) => setLastMetrics({ steps: m.steps, workoutMinutes: m.workoutMinutes }));
    }
  }, []);

  const handleToggle = async (checked: boolean) => {
    triggerLightImpact();
    if (checked) {
      const granted = await requestHealthPermissions();
      if (!granted) {
        toast.error("Health permissions were not granted. Please check device settings.");
        return;
      }
      setHealthSyncEnabled(true);
      setEnabled(true);
      const metrics = await fetchTodayHealthMetrics();
      setLastMetrics({ steps: metrics.steps, workoutMinutes: metrics.workoutMinutes });
      toast.success("Health Auto-Sync enabled! Steps & workout minutes will auto-sync with your tasks.");
    } else {
      setHealthSyncEnabled(false);
      setEnabled(false);
      toast.info("Health Auto-Sync disabled.");
    }
  };

  const handleManualSync = async () => {
    triggerLightImpact();
    setSyncing(true);
    try {
      const metrics = await fetchTodayHealthMetrics();
      setLastMetrics({ steps: metrics.steps, workoutMinutes: metrics.workoutMinutes });
      toast.success(`Synced: ${metrics.steps.toLocaleString()} steps · ${metrics.workoutMinutes} active mins`);
    } catch {
      toast.error("Could not sync native health data.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="mt-6 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <Activity className="size-4 text-brand" aria-hidden />
            <span>Apple Health & Health Connect</span>
          </div>
          <p className="text-xs leading-5 text-muted">
            Automatically sync steps and workout minutes for your Measurable fitness tasks in the background.
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={(e) => void handleToggle(e.target.checked)}
          />
          <div className="w-11 h-6 bg-border peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand" />
        </label>
      </div>

      {enabled && (
        <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted">
          <div>
            {lastMetrics ? (
              <span className="flex items-center gap-1.5 text-foreground">
                <Check size={13} className="text-brand" />
                <span>
                  Today: <b>{lastMetrics.steps.toLocaleString()}</b> steps · <b>{lastMetrics.workoutMinutes}</b> workout mins
                </span>
              </span>
            ) : (
              <span>Ready to sync</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={handleManualSync}
            disabled={syncing}
          >
            <RefreshCw size={12} className={syncing ? "animate-spin mr-1" : "mr-1"} />
            <span>Sync now</span>
          </Button>
        </div>
      )}
    </Card>
  );
}
