"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center bg-bg p-6 text-foreground">
        <div className="w-full max-w-sm text-center">
          <h2 className="text-2xl font-bold">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted">An unexpected error occurred.</p>
          <button
            onClick={() => reset()}
            className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brandfg"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
