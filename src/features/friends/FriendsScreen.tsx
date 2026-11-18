"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, CheckCircle2, ChevronRight, Flame, GraduationCap, ShieldCheck, Sparkles, Trophy, UserPlus, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card, Empty } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { api } from "@/lib/fetcher";

type Tab = "leaderboard" | "discover" | "requests";
type FriendshipStatus = "NONE" | "REQUESTED" | "INCOMING" | "FRIENDS";

export interface BadgeItem {
  badgeType: string;
  label: string;
  description: string;
  icon: string;
}

interface LeaderboardEntry {
  rank: number;
  userId?: string;
  isFriend?: boolean;
  displayName: string;
  image: string | null;
  currentStreak: number;
  longestStreak: number;
  consistency: number | null;
  successDays: number;
  mandatoryPerDay: number;
  isMe: boolean;
  badges?: BadgeItem[];
}

interface DiscoverUser {
  id: string;
  username: string | null;
  displayName: string;
  image: string | null;
  friendshipStatus: FriendshipStatus;
}

interface IncomingRequest {
  id: string;
  username: string | null;
  displayName: string;
  image: string | null;
  createdAt: string;
}

interface DiscoveryResponse {
  users: DiscoverUser[];
  incomingRequests: IncomingRequest[];
}

const tabs: { id: Tab; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "discover", label: "Add Friends" },
  { id: "requests", label: "Requests" },
];

export default function FriendsScreen({ initialRows }: { initialRows: LeaderboardEntry[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");
  const [rows, setRows] = useState(initialRows);
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    api<DiscoveryResponse>("/api/friends/discover")
      .then((response) => {
        if (!active) return;
        setUsers(response.users);
        setIncomingRequests(response.incomingRequests);
      })
      .catch(() => {
        if (active) toast.error("Could not load friends. Please try again.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function setPending(id: string, pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function sendRequest(target: DiscoverUser) {
    setPending(target.id, true);
    setUsers((current) => current.map((user) =>
      user.id === target.id ? { ...user, friendshipStatus: "REQUESTED" } : user,
    ));
    try {
      await api("/api/friends/requests", {
        method: "POST",
        body: JSON.stringify({ userId: target.id }),
      });
      toast.success(`Friend request sent to ${target.displayName}`);
    } catch {
      setUsers((current) => current.map((user) =>
        user.id === target.id ? { ...user, friendshipStatus: target.friendshipStatus } : user,
      ));
      toast.error("Could not send friend request. Please try again.");
    } finally {
      setPending(target.id, false);
    }
  }

  async function respondToRequest(request: IncomingRequest, action: "accept" | "decline") {
    setPending(request.id, true);
    setIncomingRequests((current) => current.filter((item) => item.id !== request.id));
    setUsers((current) => current.map((user) =>
      user.id === request.id
        ? { ...user, friendshipStatus: action === "accept" ? "FRIENDS" : "NONE" }
        : user,
    ));
    try {
      await api(`/api/friends/requests/${encodeURIComponent(request.id)}`, {
        method: "PUT",
        body: JSON.stringify({ action }),
      });
      if (action === "accept") {
        toast.success(`You and ${request.displayName} are now friends`);
        try {
          setRows(await api<LeaderboardEntry[]>("/api/leaderboard"));
        } catch {
          toast.error("Friend request accepted, but the leaderboard could not refresh.");
        }
      } else {
        toast.success("Friend request declined");
      }
    } catch {
      setIncomingRequests((current) => [...current, request]);
      setUsers((current) => current.map((user) =>
        user.id === request.id ? { ...user, friendshipStatus: "INCOMING" } : user,
      ));
      toast.error("Could not update friend request. Please try again.");
    } finally {
      setPending(request.id, false);
    }
  }

  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">Friends</h1>
      <p className="mt-1 text-sm text-muted">Share aggregate streak rankings with people you have connected with.</p>
      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-soft p-1" role="tablist" aria-label="Friends">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`friends-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="friends-panel"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "min-h-10 rounded-lg px-2 text-sm font-medium transition",
              activeTab === tab.id ? "bg-card shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.id === "requests" && incomingRequests.length > 0 && (
              <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-xs text-brandfg">{incomingRequests.length}</span>
            )}
          </button>
        ))}
      </div>

      <section
        id="friends-panel"
        role="tabpanel"
        aria-labelledby={`friends-tab-${activeTab}`}
        className="mt-4"
      >
        {activeTab === "leaderboard" && (
          <>
            <p className="mb-3 text-xs text-muted">Ranked by current streak, 30-day consistency, then successful days. Only aggregate stats are shared.</p>
            <ol className="space-y-2">
              {rows.length === 0 && <Empty title="No one on the board yet" hint="Add friends to compare your streaks." />}
              {rows.map((row) => {
                const isClickable = (row.isMe || row.isFriend) && Boolean(row.userId);
                return (
                  <li key={row.rank}>
                    <Card
                      className={cn(
                        "group flex items-center gap-3 p-3 transition",
                        isClickable && "cursor-pointer hover:border-brand/60 hover:bg-card/90 active:scale-[0.99]",
                        row.isMe && "border-brand",
                      )}
                      onClick={() => {
                        if (isClickable && row.userId) {
                          router.push(`/insights/${encodeURIComponent(row.userId)}`);
                        }
                      }}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (isClickable && row.userId && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          router.push(`/insights/${encodeURIComponent(row.userId)}`);
                        }
                      }}
                    >
                      <div className="display w-7 text-center text-xl font-semibold tabular-nums">{row.rank}</div>
                      <Avatar src={row.image} name={row.displayName} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {row.displayName}
                          {row.isMe && <span className="ml-2 text-xs text-brand">you</span>}
                          {row.isFriend && !row.isMe && (
                            <span className="ml-2 rounded-full bg-soft px-1.5 py-0.5 text-[10px] text-muted font-normal">friend</span>
                          )}
                        </div>
                        <div className="text-xs text-muted">30-day consistency {pct(row.consistency)} · {row.successDays} successful days · {row.mandatoryPerDay} mandatory/day</div>
                        {row.badges && row.badges.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {row.badges.map((badge) => (
                              <span
                                key={badge.badgeType}
                                title={badge.description}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-soft px-1.5 py-0.5 text-[10px] font-medium text-foreground transition-colors"
                              >
                                <BadgeIcon icon={badge.icon} />
                                <span>{badge.label}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums">
                            <Flame size={18} className="text-brand" aria-hidden />{row.currentStreak}
                          </div>
                          <div className="text-xs text-muted">best {row.longestStreak}</div>
                        </div>
                        {!row.isFriend && !row.isMe && row.userId && (
                          <Button
                            variant="outline"
                            className="ml-1 min-h-8 px-2.5 py-1 text-xs gap-1"
                            disabled={pendingIds.has(row.userId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              void sendRequest({
                                id: row.userId!,
                                username: null,
                                displayName: row.displayName,
                                image: row.image,
                                friendshipStatus: "NONE",
                              });
                            }}
                          >
                            <UserPlus size={14} aria-hidden /> Add
                          </Button>
                        )}
                        {isClickable && (
                          <ChevronRight
                            size={18}
                            className="text-muted shrink-0 transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {activeTab === "discover" && (
          <div className="space-y-2">
            {isLoading && <p className="py-6 text-center text-sm text-muted">Loading people…</p>}
            {!isLoading && users.length === 0 && <Empty title="No one else is here yet" />}
            {users.map((person) => (
              <Card key={person.id} className="flex items-center gap-3 p-3">
                <Avatar src={person.image} name={person.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{person.displayName}</div>
                  {person.username && <div className="truncate text-xs text-muted">@{person.username}</div>}
                </div>
                {person.friendshipStatus === "NONE" ? (
                  <Button
                    className="px-3"
                    disabled={pendingIds.has(person.id)}
                    onClick={() => void sendRequest(person)}
                  >
                    <UserPlus size={16} aria-hidden /> Add
                  </Button>
                ) : (
                  <Button variant="outline" className="px-3" disabled>
                    {person.friendshipStatus === "REQUESTED" && "Requested"}
                    {person.friendshipStatus === "INCOMING" && "Incoming"}
                    {person.friendshipStatus === "FRIENDS" && <><Check size={16} aria-hidden /> Friends</>}
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}

        {activeTab === "requests" && (
          <div className="space-y-2">
            {isLoading && <p className="py-6 text-center text-sm text-muted">Loading requests…</p>}
            {!isLoading && incomingRequests.length === 0 && <Empty title="No pending requests" />}
            {incomingRequests.map((request) => (
              <Card key={request.id} className="flex items-center gap-3 p-3">
                <Avatar src={request.image} name={request.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{request.displayName}</div>
                  {request.username && <div className="truncate text-xs text-muted">@{request.username}</div>}
                </div>
                <Button
                  className="px-3"
                  disabled={pendingIds.has(request.id)}
                  aria-label={`Accept ${request.displayName}'s request`}
                  onClick={() => void respondToRequest(request, "accept")}
                >
                  <Check size={17} aria-hidden /> Accept
                </Button>
                <Button
                  variant="outline"
                  className="px-3"
                  disabled={pendingIds.has(request.id)}
                  aria-label={`Decline ${request.displayName}'s request`}
                  onClick={() => void respondToRequest(request, "decline")}
                >
                  <X size={17} aria-hidden /> Decline
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function BadgeIcon({ icon, size = 12, className }: { icon: string; size?: number; className?: string }) {
  switch (icon) {
    case "Flame":
      return <Flame size={size} className={className ?? "text-brand"} aria-hidden />;
    case "Trophy":
      return <Trophy size={size} className={className ?? "text-amber-500"} aria-hidden />;
    case "Brain":
      return <Brain size={size} className={className ?? "text-purple-500"} aria-hidden />;
    case "GraduationCap":
      return <GraduationCap size={size} className={className ?? "text-indigo-500"} aria-hidden />;
    case "CheckCircle2":
      return <CheckCircle2 size={size} className={className ?? "text-emerald-500"} aria-hidden />;
    case "ShieldCheck":
      return <ShieldCheck size={size} className={className ?? "text-blue-500"} aria-hidden />;
    case "Zap":
      return <Zap size={size} className={className ?? "text-amber-400"} aria-hidden />;
    default:
      return <Sparkles size={size} className={className ?? "text-brand"} aria-hidden />;
  }
}

