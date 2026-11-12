import { pageUser } from "@/lib/auth/session";
import { leaderboard } from "@/server/services/stats";
import FriendsScreen from "@/features/friends/FriendsScreen";

export default async function FriendsPage() {
  const user = await pageUser();
  const rows = await leaderboard(user);
  return <FriendsScreen initialRows={rows} />;
}
