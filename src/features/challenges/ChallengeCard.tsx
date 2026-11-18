"use client";

import { useState } from "react";
import { Trophy, Users, Calendar, CheckCircle2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { triggerLightImpact, triggerSuccessNotification } from "@/lib/haptics";
import type { ChallengeView } from "@/server/services/challenges";
import { toast } from "sonner";

export default function ChallengeCard({
  challenge,
  onRefresh,
}: {
  challenge: ChallengeView;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isJoined, setIsJoined] = useState(challenge.isJoined);
  const [showContributors, setShowContributors] = useState(false);

  const toggleJoin = async () => {
    triggerLightImpact();
    setBusy(true);
    const nextJoined = !isJoined;
    setIsJoined(nextJoined);

    try {
      if (nextJoined) {
        await api(`/api/challenges/${challenge.id}/join`, { method: "POST" });
        triggerSuccessNotification();
        toast.success(`Joined "${challenge.title}"! Your daily logs will now count.`);
      } else {
        await api(`/api/challenges/${challenge.id}/join`, { method: "DELETE" });
        toast.info(`Left "${challenge.title}".`);
      }
      onRefresh();
    } catch {
      setIsJoined(!nextJoined);
      toast.error("Failed to update participation.");
    } finally {
      setBusy(false);
    }
  };

  const isCompleted = challenge.progressPct >= 100;
  const unitLabel = challenge.unit ? ` ${challenge.unit}` : "";

  return (
    <Card className="relative overflow-hidden border border-border bg-card p-5 shadow-sm transition hover:shadow-md sm:p-6">
      {/* Category & Status badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
            <Trophy size={13} aria-hidden />
            <span>{challenge.category ?? "WORKSPACE CHALLENGE"}</span>
          </span>
          {isCompleted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
              <CheckCircle2 size={13} />
              <span>Goal Reached!</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Calendar size={13} />
            <span>{challenge.daysRemaining > 0 ? `${challenge.daysRemaining} days left` : "Ended"}</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Users size={13} />
            <span>{challenge.participantCount} {challenge.participantCount === 1 ? "member" : "members"}</span>
          </span>
        </div>
      </div>

      {/* Challenge Title & Description */}
      <div className="mt-3">
        <h2 className="display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{challenge.title}</h2>
        {challenge.description && (
          <p className="mt-1 text-sm text-muted">{challenge.description}</p>
        )}
      </div>

      {/* Real-time Progress Bar */}
      <div className="mt-5 space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <div>
            <span className="display text-2xl font-bold tabular-nums text-foreground">
              {challenge.currentValue.toLocaleString()}
            </span>
            <span className="text-muted"> / {challenge.target.toLocaleString()}{unitLabel}</span>
          </div>
          <div className="font-mono text-lg font-bold text-brand tabular-nums">
            {challenge.progressPct}%
          </div>
        </div>

        {/* Progress bar container */}
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-soft">
          <div
            role="progressbar"
            aria-valuenow={challenge.progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isCompleted
                ? "bg-gradient-to-r from-brand to-green-500 shadow-sm"
                : "bg-brand shadow-xs"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, challenge.progressPct))}%` }}
          />
        </div>
      </div>

      {/* Actions & Top Contributors */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isJoined ? "outline" : "primary"}
            className="min-h-9 px-4 text-xs font-semibold"
            disabled={busy}
            onClick={toggleJoin}
          >
            {isJoined ? "Joined (Leave)" : "Join Team Challenge"}
          </Button>

          {challenge.topContributors.length > 0 && (
            <button
              type="button"
              onClick={() => setShowContributors(!showContributors)}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground transition"
            >
              <span>{showContributors ? "Hide" : "Leaderboard"}</span>
              {showContributors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>

        <div className="text-xs text-muted">
          Created by <b>{challenge.creatorName}</b>
        </div>
      </div>

      {/* Expanded contributors list */}
      {showContributors && challenge.topContributors.length > 0 && (
        <div className="mt-4 rounded-xl border border-border/80 bg-soft/50 p-3 text-xs">
          <div className="mb-2 font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles size={13} className="text-brand" />
            <span>Top Contributors</span>
          </div>
          <div className="space-y-1.5">
            {challenge.topContributors.map((c, index) => (
              <div key={c.userId} className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2 text-foreground font-medium">
                  <span className="text-muted tabular-nums">#{index + 1}</span>
                  <span>{c.name}</span>
                </span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {c.contributed.toLocaleString()}{unitLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
