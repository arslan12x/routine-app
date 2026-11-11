"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, inputCls } from "@/components/ui";
import { api } from "@/lib/fetcher";

interface Row { username: string; role: "ADMIN" | "MEMBER"; revokedAt: string | null }

export default function AdminScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Row[]>("/api/admin/accounts").then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">User accounts</h1>
      <p className="text-sm text-muted">Create accounts with a username, real email, and temporary password. Share the password privately. Revoking signs them out immediately.</p>
      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          const created = await api<{ username: string }>("/api/admin/accounts", { method: "POST", body: JSON.stringify({ username, email, password }) });
          setRows((current) => [{ username: created.username, role: "MEMBER", revokedAt: null }, ...current.filter((r) => r.username !== created.username)]);
          setUsername("");
          setEmail("");
          setPassword("");
        });
      }}>
        <input required disabled={busy} minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" aria-label="Username" className={inputCls} />
        <input required disabled={busy} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" className={inputCls} />
        <input required disabled={busy} minLength={8} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" aria-label="Temporary password" className={inputCls} />
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
      </form>
      {err && <p role="alert" className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
      <ul className="mt-4 space-y-2">
        {loading && <li><div className="h-14 animate-pulse rounded-xl bg-soft" /></li>}
        {rows.map((r) => (
          <li key={r.username}><Card className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0"><div className="truncate text-sm font-medium">@{r.username}</div><div className="text-xs text-muted">{r.role === "ADMIN" ? "Admin · " : ""}{r.revokedAt ? "Revoked" : "Active"}</div></div>
            {r.revokedAt
              ? <Button variant="outline" disabled={busy} onClick={() => act(async () => {
                await api(`/api/admin/accounts/${encodeURIComponent(r.username)}`, { method: "POST" });
                setRows((current) => current.map((item) => item.username === r.username ? { ...item, revokedAt: null } : item));
              })}>Restore</Button>
              : <Button variant="outline" disabled={busy} onClick={() => confirm(`Revoke @${r.username}?`) && act(async () => {
                await api(`/api/admin/accounts/${encodeURIComponent(r.username)}`, { method: "DELETE" });
                setRows((current) => current.map((item) => item.username === r.username ? { ...item, revokedAt: new Date().toISOString() } : item));
              })}>Revoke</Button>}
          </Card></li>
        ))}
      </ul>
    </>
  );
}
