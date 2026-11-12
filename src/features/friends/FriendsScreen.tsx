"use client";

import { useEffect, useState } from "react";
import { Check, Flame, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card, Empty } from "@/components/ui";
import { cn, pct } from "@/lib/cn";
import { api } from "@/lib/fetcher";

type Tab = "leaderboard" | "discover" | "requests";
type FriendshipStatus = "NONE" | "REQUESTED" | "INCOMING" | "FRIENDS";

interface LeaderboardEntry {
  rank: number;
  displayName: string;
  image: string | null;
  currentStreak: number;
  longestStreak: number;
  consistency: number | null;
  successDays: number;
  mandatoryPerDay: number;
  isMe: boolean;
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
              {rows.map((row) => (
                <li key={row.rank}>
                  <Card className={cn("flex items-center gap-3 p-3", row.isMe && "border-brand")}>
                    <div className="display w-7 text-center text-xl font-semibold tabular-nums">{row.rank}</div>
                    <Avatar src={row.image} name={row.displayName} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {row.displayName}{row.isMe && <span className="ml-2 text-xs text-brand">you</span>}
                      </div>
                      <div className="text-xs text-muted">30-day consistency {pct(row.consistency)} · {row.successDays} successful days · {row.mandatoryPerDay} mandatory/day</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums">
                        <Flame size={18} className="text-brand" aria-hidden />{row.currentStreak}
                      </div>
                      <div className="text-xs text-muted">best {row.longestStreak}</div>
                    </div>
                  </Card>
                </li>
              ))}
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
