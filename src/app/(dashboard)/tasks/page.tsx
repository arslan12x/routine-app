import { Suspense } from "react";
import { pageUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import TasksScreen from "@/features/tasks/TasksScreen";
import { getLatestCoachReview } from "@/server/ai/coach";
import { dayView } from "@/server/services/tasks";
import { Skeleton } from "@/components/ui";

export default async function TasksPage() {
  const user = await pageUser();
  const date = todayIn(user.timezone);
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<TasksLoading />}>
        <TasksContent user={user} date={date} />
      </Suspense>
    </div>
  );
}

async function TasksContent({ user, date }: { user: Awaited<ReturnType<typeof pageUser>>; date: string }) {
  const [data, coachReview] = await Promise.all([
    dayView(user, date),
    getLatestCoachReview(user.id),
  ]);
  return <TasksScreen key={data.date} userId={user.id} initial={data} initialCoachReview={coachReview} />;
}

function TasksLoading() {
  return (
    <div aria-label="Loading tasks" aria-busy="true">
      <Skeleton className="mt-2 h-9 w-48" />
      <Skeleton className="mt-2 h-5 w-40" />
      <Skeleton className="mt-4 h-28" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
