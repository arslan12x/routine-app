"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, inputCls } from "@/components/ui";
import { authClient } from "@/lib/auth/client";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.username({ username, password, callbackURL: "/tasks" });
      if (result.error) {
        setError("Username or password is incorrect.");
        return;
      }
      router.replace("/tasks");
      router.refresh();
    } catch {
      setError("Username or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="display text-5xl font-semibold">Routine</h1>
        <p className="mt-3 text-muted">A private streak tracker for a small group of friends.</p>
        <form className="mt-8 space-y-3 text-left" onSubmit={submit}>
          <label className="block text-sm font-medium" htmlFor="username">Username</label>
          <input id="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
          <label className="block text-sm font-medium" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          {error && <p role="alert" className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{error}</p>}
          <Button className="w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-4 text-xs text-muted">Ask the admin to create your account.</p>
      </div>
    </main>
  );
}
