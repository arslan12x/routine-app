"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui";

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[Tasks Error Boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
      <h2 className="text-xl font-semibold text-foreground">Something went wrong loading your tasks</h2>
      <p className="mt-2 text-sm text-muted">
        An unexpected error occurred while loading or displaying your tasks.
      </p>
      <Button onClick={() => reset()} className="mt-5" variant="outline">
        Try again
      </Button>
    </div>
  );
}
