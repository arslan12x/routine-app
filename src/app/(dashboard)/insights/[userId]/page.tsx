import { pageUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import FriendInsightsScreen from "@/features/insights/FriendInsightsScreen";

export default async function FriendInsightsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await pageUser();
  const { userId } = await params;
  const today = todayIn(user.timezone);

  return <FriendInsightsScreen targetUserId={userId} today={today} />;
}
