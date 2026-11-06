import CalendarScreen, { type CalendarData } from "@/features/calendar/CalendarScreen";
import { pageUser } from "@/lib/auth/session";
import { calendar } from "@/server/services/stats";

export default async function CalendarPage() {
  const user = await pageUser();
  return <CalendarScreen initial={(await calendar(user)) as CalendarData} />;
}
