"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, UserCheck } from "lucide-react";
import { Avatar, Card, Empty, Skeleton, Stat, inputCls } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import type { InsightsData } from "./Charts";

const Charts = dynamic(() => import("./Charts"), {
  ssr: false,
  loading: () => <Skeleton className="mt-4 h-72" />,
});

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface FriendInsightsResult extends InsightsData {
  user: {
    id: string;
    displayName: string;
    image: string | null;
    isMe: boolean;
  };
  from: string;
  to: string;
  kpis: {
    totalCompleted: number;
    mandatoryRate: number | null;
    extraRate: number | null;
    overallRate: number | null;
    consistency: number | null;
    currentStreak: number;
    longestStreak: number;
    bestWeekday: { weekday: number; rate: number } | null;
  };
}

type Range = "day" | "week" | "month" | "custom";

export default function FriendInsightsScreen({
  targetUserId,
  today,
}: {
  targetUserId: string;
  today: string;
}) {
  const [range, setRange] = useState<Range>("week");
  const [group, setGroup] = useState<"" | "day" | "week" | "month">("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<FriendInsightsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);

    const q = new URLSearchParams({ range });
    if (group) q.set("group", group);
    if (range === "custom") {
      q.set("from", from);
      q.set("to", to);
    }

    api<FriendInsightsResult>(`/api/users/${encodeURIComponent(targetUserId)}/insights?${q}`)
      .then((r) => {
        if (live) {
          setData(r);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (live) {
          setErr(e.message || "Could not load habit insights.");
          setLoading(false);
        }
      });

    return () => {
      live = false;
    };
  }, [targetUserId, range, group, from, to]);

  const k = data?.kpis;
  const friend = data?.user;

  return (
    <>
      <div className="mt-2 flex items-center justify-between">
        <Link
          href="/friends"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition"
        >
          <ArrowLeft size={16} aria-hidden /> Back to Friends
        </Link>
      </div>

      {friend && (
        <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4">
          <Avatar src={friend.image} name={friend.displayName} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="display text-2xl font-semibold truncate">{friend.displayName}</h1>
              {friend.isMe ? (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand font-medium">You</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-xs text-muted font-medium">
                  <UserCheck size={13} className="text-brand" aria-hidden /> Friend
                </span>
              )}
            </div>
            <p className="text-xs text-muted">Viewing public routine and consistency metrics</p>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Range" className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-soft p-1">
        {(["day", "week", "month", "custom"] as Range[]).map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={cn(
              "min-h-10 rounded-xl text-sm font-medium capitalize transition",
              range === r ? "bg-card shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {range === "custom" && (
          <>
            <input
              type="date"
              aria-label="From"
              max={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={cn(inputCls, "w-auto")}
            />
            <input
              type="date"
              aria-label="To"
              max={today}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={cn(inputCls, "w-auto")}
            />
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-muted">
          Group
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as typeof group)}
            className={cn(inputCls, "w-auto")}
          >
            <option value="">Auto</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
      </div>

      {err && (
        <Card className="mt-6 border-bad/30 bg-bad/5 p-6 text-center">
          <p role="alert" className="text-sm font-medium text-bad">
            {err}
          </p>
          <p className="mt-1 text-xs text-muted">
            You can only view insights for users you are connected with on the Friends leaderboard.
          </p>
          <Link
            href="/friends"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brandfg transition hover:opacity-90"
          >
            Return to Friends
          </Link>
        </Card>
      )}

      {loading && !err && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {data && k && (
        data.trend.length === 0 ? (
          <div className="mt-6">
            <Empty
              title="No habit logs in this period"
              hint="Check another date range or wait until your friend logs more habits."
            />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Tasks completed" value={k.totalCompleted} />
              <Stat label="Mandatory rate" value={pct(k.mandatoryRate)} />
              <Stat label="Extra rate" value={pct(k.extraRate)} />
              <Stat label="Overall" value={pct(k.overallRate)} hint="completed ÷ scheduled" />
              <Stat label="Current streak" value={`${k.currentStreak}d`} />
              <Stat label="Longest streak" value={`${k.longestStreak}d`} />
              <Stat
                label="Best weekday"
                value={k.bestWeekday ? DAYS[k.bestWeekday.weekday] : "—"}
                hint={k.bestWeekday ? pct(k.bestWeekday.rate) : "needs 4+ samples"}
              />
              <Stat label="Consistency" value={pct(k.consistency)} hint="mandatory days" />
            </div>
            <Charts d={data} />
          </>
        )
      )}
    </>
  );
}
