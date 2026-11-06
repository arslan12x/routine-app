import InsightsScreen from "@/features/insights/InsightsScreen";
import { pageUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";

export default async function InsightsPage() {
  const user = await pageUser();
  return <InsightsScreen today={todayIn(user.timezone)} />;
}
