"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Empty, Skeleton, Stat, inputCls } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { api } from "@/lib/fetcher";
import type { InsightsData } from "./Charts";

const Charts = dynamic(() => import("./Charts"), { ssr: false, loading: () => <Skeleton className="mt-4 h-72" /> });
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Result extends InsightsData {
  from: string; to: string;
  kpis: { totalCompleted: number; mandatoryRate: number | null; extraRate: number | null; overallRate: number | null; consistency: number | null; currentStreak: number; longestStreak: number; bestWeekday: { weekday: number; rate: number } | null };
}
type Range = "day" | "week" | "month" | "custom";

export default function InsightsScreen({ today }: { today: string }) {
  const [range, setRange] = useState<Range>("week");
  const [group, setGroup] = useState<"" | "day" | "week" | "month">("");
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [data, setData] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    const q = new URLSearchParams({ range });
    if (group) q.set("group", group);
    if (range === "custom") { q.set("from", from); q.set("to", to); }
    api<Result>(`/api/insights?${q}`).then((r) => live && setData(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [range, group, from, to]);

  const k = data?.kpis;
  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">Insights</h1>
      <div role="tablist" aria-label="Range" className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-soft p-1">
        {(["day", "week", "month", "custom"] as Range[]).map((r) => (
          <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={cn("min-h-10 rounded-xl text-sm font-medium capitalize", range === r ? "bg-card shadow-sm" : "text-muted")}>{r}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {range === "custom" && (<>
          <input type="date" aria-label="From" max={today} value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputCls, "w-auto")} />
          <input type="date" aria-label="To" max={today} value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputCls, "w-auto")} />
        </>)}
        <label className="ml-auto flex items-center gap-2 text-muted">Group
          <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className={cn(inputCls, "w-auto")}><option value="">Auto</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select>
        </label>
      </div>

      {err && <p role="alert" className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
      {!data && !err && <div className="mt-4 grid grid-cols-2 gap-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>}
      {data && k && (data.trend.length === 0 ? <div className="mt-6"><Empty title="Nothing to show yet" hint="Add tasks and complete a few days, then come back." /></div> : (<>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Tasks completed" value={k.totalCompleted} />
          <Stat label="Mandatory rate" value={pct(k.mandatoryRate)} />
          <Stat label="Extra rate" value={pct(k.extraRate)} />
          <Stat label="Overall" value={pct(k.overallRate)} hint="completed ÷ scheduled" />
          <Stat label="Current streak" value={`${k.currentStreak}d`} />
          <Stat label="Longest streak" value={`${k.longestStreak}d`} />
          <Stat label="Best weekday" value={k.bestWeekday ? DAYS[k.bestWeekday.weekday] : "—"} hint={k.bestWeekday ? pct(k.bestWeekday.rate) : "needs 4+ samples"} />
          <Stat label="Consistency" value={pct(k.consistency)} hint="mandatory days" />
        </div>
        <Charts d={data} />
      </>))}
    </>
  );
}
