import { pageUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { listWorkspaceChallenges } from "@/server/services/challenges";
import ChallengesScreen from "@/features/challenges/ChallengesScreen";

export default async function ChallengesPage() {
  const user = await pageUser();
  const today = todayIn(user.timezone);
  const initialChallenges = await listWorkspaceChallenges(user);

  return (
    <ChallengesScreen
      initialChallenges={initialChallenges}
      organizationName={user.organizationName}
      today={today}
    />
  );
}
