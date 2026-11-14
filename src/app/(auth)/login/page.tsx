"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, inputCls } from "@/components/ui";
import { authClient } from "@/lib/auth/client";

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const normalizedIdentifier = identifier.trim();
      const result = normalizedIdentifier.includes("@")
        ? await authClient.signIn.email({ email: normalizedIdentifier, password, callbackURL: "/tasks" })
        : await authClient.signIn.username({ username: normalizedIdentifier, password, callbackURL: "/tasks" });
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

  async function submitSso() {
    setSsoBusy(true);
    setError(null);
    try {
      const email = identifier.trim().toLowerCase();
      if (!email.includes("@")) {
        setError("Enter your organization email to continue with SSO.");
        return;
      }
      const result = await authClient.signIn.sso({ email, callbackURL: "/tasks", providerType: "saml" });
      if (result.error || !result.data?.url) {
        setError(result.error?.message ?? "No SSO provider is configured for this email domain.");
        return;
      }
      window.location.assign(result.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start organization sign-in.");
    } finally {
      setSsoBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="display text-5xl font-semibold">Routine</h1>
        <p className="mt-3 text-muted">A private streak tracker for a small group of friends.</p>
        <form className="mt-8 space-y-3 text-left" onSubmit={submit}>
          <label className="block text-sm font-medium" htmlFor="identifier">Username or email</label>
          <input id="identifier" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputCls} />
          <label className="block text-sm font-medium" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-20`} />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-3 my-auto h-fit text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {error && <p role="alert" className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{error}</p>}
          <Button className="w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <Button className="w-full" variant="outline" type="button" disabled={busy || ssoBusy} onClick={submitSso}>
            {ssoBusy ? "Connecting to your organization…" : "Continue with organization SSO"}
          </Button>
        </form>
        <p className="mt-4 text-xs text-muted">Ask the admin to create your account.</p>
      </div>
    </main>
  );
}
