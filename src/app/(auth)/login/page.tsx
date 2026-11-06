"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth/client";

export default function Login() {
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="display text-5xl font-semibold">Routine</h1>
        <p className="mt-3 text-muted">A private streak tracker for a small group of friends.</p>
        <Button className="mt-8 w-full" disabled={busy} onClick={() => { setBusy(true); authClient.signIn.social({ provider: "google", callbackURL: "/tasks", errorCallbackURL: "/access-denied" }); }}>
          {busy ? "Redirecting…" : "Continue with Google"}
        </Button>
        <p className="mt-4 text-xs text-muted">Invite only. Your Google email must be on the list.</p>
      </div>
    </main>
  );
}
