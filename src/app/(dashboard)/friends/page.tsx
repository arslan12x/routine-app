import { Flame } from "lucide-react";
import { Avatar, Card, Empty } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { pageUser } from "@/lib/auth/session";
import { leaderboard } from "@/server/services/stats";

export default async function FriendsPage() {
  const user = await pageUser();
  const rows = await leaderboard(user);
  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">Friends</h1>
      <p className="text-sm text-muted">Ranked by current streak, then 30-day consistency, then total successful days. Only these numbers are shared.</p>
      <ol className="mt-4 space-y-2">
        {rows.length === 0 && <Empty title="No one on the board yet" />}
        {rows.map((r) => (
          <li key={r.rank}>
            <Card className={cn("flex items-center gap-3 p-3", r.isMe && "border-brand")}>
              <div className="display w-7 text-center text-xl font-semibold tabular-nums">{r.rank}</div>
              <Avatar src={r.image} name={r.displayName} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.displayName}{r.isMe && <span className="ml-2 text-xs text-brand">you</span>}</div>
                <div className="text-xs text-muted">30-day consistency {pct(r.consistency)} · {r.successDays} successful days · {r.mandatoryPerDay} mandatory/day</div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums"><Flame size={18} className="text-brand" aria-hidden />{r.currentStreak}</div>
                <div className="text-xs text-muted">best {r.longestStreak}</div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
