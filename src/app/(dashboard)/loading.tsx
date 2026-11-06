import { Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div aria-label="Loading page" aria-busy="true">
      <Skeleton className="mt-2 h-9 w-48" />
      <Skeleton className="mt-3 h-5 w-64" />
      <Skeleton className="mt-5 h-28" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
