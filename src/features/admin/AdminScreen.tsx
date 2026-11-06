"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, inputCls } from "@/components/ui";
import { api } from "@/lib/fetcher";

interface Row { username: string; role: "ADMIN" | "MEMBER"; revokedAt: string | null }

export default function AdminScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Row[]>("/api/admin/accounts").then(setRows).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } };

  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">User accounts</h1>
      <p className="text-sm text-muted">Create accounts with a username and temporary password. Share the password privately. Revoking signs them out immediately.</p>
      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          await api("/api/admin/accounts", { method: "POST", body: JSON.stringify({ username, password }) });
          setUsername("");
          setPassword("");
        });
      }}>
        <input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" aria-label="Username" className={inputCls} />
        <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" aria-label="Temporary password" className={inputCls} />
        <Button type="submit">Create account</Button>
      </form>
      {err && <p role="alert" className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.username}><Card className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0"><div className="truncate text-sm font-medium">@{r.username}</div><div className="text-xs text-muted">{r.role === "ADMIN" ? "Admin · " : ""}{r.revokedAt ? "Revoked" : "Active"}</div></div>
            {r.revokedAt
              ? <Button variant="outline" onClick={() => act(() => api(`/api/admin/accounts/${encodeURIComponent(r.username)}`, { method: "POST" }))}>Restore</Button>
              : <Button variant="outline" onClick={() => confirm(`Revoke @${r.username}?`) && act(() => api(`/api/admin/accounts/${encodeURIComponent(r.username)}`, { method: "DELETE" }))}>Revoke</Button>}
          </Card></li>
        ))}
      </ul>
    </>
  );
}
