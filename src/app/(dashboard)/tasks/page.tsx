import { pageUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import TasksScreen from "@/features/tasks/TasksScreen";
import { dayView } from "@/server/services/tasks";

export default async function TasksPage() {
  const user = await pageUser();
  const data = await dayView(user, todayIn(user.timezone));
  return <TasksScreen key={data.date} initial={data} />;
}
