"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, inputCls } from "@/components/ui";
import { api } from "@/lib/fetcher";

interface Row { email: string; role: "ADMIN" | "MEMBER"; revokedAt: string | null }

export default function AdminScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Row[]>("/api/admin/allowed-emails").then(setRows).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } };

  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">Invited emails</h1>
      <p className="text-sm text-muted">Use each person&apos;s exact Google account email. Revoking signs them out immediately.</p>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { await api("/api/admin/allowed-emails", { method: "POST", body: JSON.stringify({ email }) }); setEmail(""); }); }}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" aria-label="Email to invite" className={inputCls} />
        <Button type="submit">Invite</Button>
      </form>
      {err && <p role="alert" className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.email}><Card className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0"><div className="truncate text-sm font-medium">{r.email}</div><div className="text-xs text-muted">{r.role === "ADMIN" ? "Admin · " : ""}{r.revokedAt ? "Revoked" : "Active"}</div></div>
            {r.revokedAt
              ? <Button variant="outline" onClick={() => act(() => api("/api/admin/allowed-emails", { method: "POST", body: JSON.stringify({ email: r.email, role: r.role }) }))}>Restore</Button>
              : <Button variant="outline" onClick={() => confirm(`Revoke ${r.email}?`) && act(() => api(`/api/admin/allowed-emails/${encodeURIComponent(r.email)}`, { method: "DELETE" }))}>Revoke</Button>}
          </Card></li>
        ))}
      </ul>
    </>
  );
}
