"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trophy, Sparkles, Building2, RefreshCw } from "lucide-react";
import { Button, Card, Skeleton } from "@/components/ui";
import { api } from "@/lib/fetcher";
import { getSupabaseClient } from "@/lib/supabase";
import type { ChallengeView } from "@/server/services/challenges";
import ChallengeCard from "./ChallengeCard";
import CreateChallengeModal from "./CreateChallengeModal";

export default function ChallengesScreen({
  initialChallenges,
  organizationName,
  today,
}: {
  initialChallenges: ChallengeView[];
  organizationName: string;
  today: string;
}) {
  const [challenges, setChallenges] = useState<ChallengeView[]>(initialChallenges);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchChallenges = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<ChallengeView[]>("/api/challenges");
      setChallenges(data);
    } catch (err) {
      console.error("[Challenges] Could not refresh challenges", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 15s to keep team challenge progress bar real-time across workspaces
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchChallenges();
    }, 15_000);
    return () => clearInterval(timer);
  }, [fetchChallenges]);

  // Listen to Supabase Realtime changes for TaskLog updates to revalidate
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel("workspace-challenges")
      .on("postgres_changes", { event: "*", schema: "public", table: "TaskLog" }, () => {
        void fetchChallenges();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchChallenges]);

  return (
    <>
      {/* Workspace Header */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Building2 size={14} className="text-brand" />
            <span>{organizationName}</span>
          </div>
          <h1 className="display mt-1 text-3xl font-semibold">Team Challenges</h1>
          <p className="mt-1 text-sm text-muted">
            Shared goals where individual daily logs aggregate into a real-time, organization-wide progress bar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="size-10 p-0 rounded-full"
            title="Refresh challenges"
            onClick={fetchChallenges}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "animate-spin text-brand" : "text-muted"} />
          </Button>

          <Button
            type="button"
            className="flex items-center gap-2 rounded-full px-4"
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} />
            <span>New Challenge</span>
          </Button>
        </div>
      </div>

      {/* Challenges Content */}
      <div className="mt-6 space-y-5">
        {challenges.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <div className="grid size-14 place-items-center rounded-full bg-brand/10 text-brand mb-3">
              <Trophy size={26} />
            </div>
            <h2 className="display text-xl font-semibold text-foreground">No active team challenges yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted">
              Launch your team&apos;s first collective goal—like walking 1,000,000 steps together, completing 300 workout minutes, or reading 500 pages.
            </p>
            <Button
              type="button"
              className="mt-6 flex items-center gap-2 rounded-full px-5"
              onClick={() => setShowModal(true)}
            >
              <Sparkles size={16} />
              <span>Create First Team Challenge</span>
            </Button>
          </Card>
        ) : (
          challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} onRefresh={fetchChallenges} />
          ))
        )}
      </div>

      {showModal && (
        <CreateChallengeModal
          today={today}
          onClose={() => setShowModal(false)}
          onCreated={fetchChallenges}
        />
      )}
    </>
  );
}
