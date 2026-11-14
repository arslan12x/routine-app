"use client";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, inputCls } from "@/components/ui";
import { api } from "@/lib/fetcher";

interface AccountRow { username: string; role: "ADMIN" | "MEMBER"; revokedAt: string | null }
interface SsoProvider { id: string; providerId: string; domain: string; issuer: string }
interface AuditRow {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  targetUserId: string | null;
  metadata: Record<string, unknown> | null;
}
interface CreatedWorkspace { id: string; name: string; slug: string; ownerUsername: string }

export default function AdminScreen({ canCreateWorkspace, activeWorkspaceName }: { canCreateWorkspace: boolean; activeWorkspaceName: string }) {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [createdWorkspace, setCreatedWorkspace] = useState<CreatedWorkspace | null>(null);
  const [domain, setDomain] = useState("");
  const [metadata, setMetadata] = useState("");
  const [origin, setOrigin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [accounts, ssoProviders, audit] = await Promise.all([
        api<AccountRow[]>("/api/admin/accounts"),
        api<SsoProvider[]>("/api/admin/sso"),
        api<AuditRow[]>("/api/admin/audit"),
      ]);
      setRows(accounts);
      setProviders(ssoProviders);
      setAuditRows(audit);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unable to load workspace administration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-7">
      <header className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-brand/10 p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{activeWorkspaceName} · Workspace controls</p>
        <h1 className="display mt-2 text-3xl font-semibold sm:text-4xl">Admin console</h1>
        <p className="mt-2 text-sm text-muted">Manage membership, single sign-on, and the workspace audit trail.</p>
      </header>

      {err && <p role="alert" className="rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}

      {canCreateWorkspace && <section>
        <div className="mb-3">
          <h2 className="display text-2xl font-semibold">Create a workspace</h2>
          <p className="mt-1 text-sm text-muted">Provision an isolated organization with its own owner account. Data remains private to each member.</p>
        </div>
        <Card className="p-4 sm:p-5">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const created = await api<CreatedWorkspace>("/api/admin/workspaces", {
                method: "POST",
                body: JSON.stringify({ name: workspaceName, username: ownerUsername, email: ownerEmail, password: ownerPassword }),
              });
              setCreatedWorkspace(created);
              setWorkspaceName("");
              setOwnerUsername("");
              setOwnerEmail("");
              setOwnerPassword("");
              await load();
            });
          }}>
            <label className="space-y-1 text-sm font-medium">Workspace name
              <input required disabled={busy} minLength={2} maxLength={80} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Team" className={inputCls} />
            </label>
            <label className="space-y-1 text-sm font-medium">Owner username
              <input required disabled={busy} minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" value={ownerUsername} onChange={(e) => setOwnerUsername(e.target.value)} placeholder="team-admin" className={inputCls} />
            </label>
            <label className="space-y-1 text-sm font-medium">Owner email
              <input required disabled={busy} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="admin@example.com" className={inputCls} />
            </label>
            <label className="space-y-1 text-sm font-medium">Temporary password
              <input required disabled={busy} type="password" minLength={8} maxLength={128} autoComplete="new-password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} className={inputCls} />
            </label>
            <Button className="sm:col-span-2 sm:justify-self-start" type="submit" disabled={busy}>{busy ? "Creating workspace…" : "Create isolated workspace"}</Button>
          </form>
          {createdWorkspace && <p className="mt-4 rounded-xl bg-ok/10 p-3 text-sm text-ok" role="status">
            Created {createdWorkspace.name} ({createdWorkspace.slug}) with owner @{createdWorkspace.ownerUsername}. Share the temporary password privately.
          </p>}
        </Card>
      </section>}

      <section>
        <div className="mb-3">
          <h2 className="display text-2xl font-semibold">People</h2>
          <p className="mt-1 text-sm text-muted">Accounts and access are scoped to this workspace.</p>
        </div>
        <Card className="p-4 sm:p-5">
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const created = await api<{ username: string }>("/api/admin/accounts", { method: "POST", body: JSON.stringify({ username, email, password }) });
              setRows((current) => [{ username: created.username, role: "MEMBER", revokedAt: null }, ...current.filter((r) => r.username !== created.username)]);
              setUsername("");
              setEmail("");
              setPassword("");
              await load();
            });
          }}>
            <input required disabled={busy} minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" aria-label="Username" className={inputCls} />
            <input required disabled={busy} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" className={inputCls} />
            <input required disabled={busy} minLength={8} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" aria-label="Temporary password" className={inputCls} />
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
          </form>
          <ul className="mt-4 space-y-2">
            {loading && <li><div className="h-14 animate-pulse rounded-xl bg-soft" /></li>}
            {!loading && rows.length === 0 && <li className="py-4 text-sm text-muted">No accounts in this workspace yet.</li>}
            {rows.map((row) => (
              <li key={row.username}>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg/70 p-3">
                  <div className="min-w-0"><div className="truncate text-sm font-medium">@{row.username}</div><div className="text-xs text-muted">{row.role === "ADMIN" ? "Admin · " : ""}{row.revokedAt ? "Revoked" : "Active"}</div></div>
                  {row.revokedAt
                    ? <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
                      await api(`/api/admin/accounts/${encodeURIComponent(row.username)}`, { method: "POST" });
                      await load();
                    })}>Restore</Button>
                    : <Button variant="outline" disabled={busy} onClick={() => window.confirm(`Revoke @${row.username}?`) && void act(async () => {
                      await api(`/api/admin/accounts/${encodeURIComponent(row.username)}`, { method: "DELETE" });
                      await load();
                    })}>Revoke</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="display text-2xl font-semibold">SAML single sign-on</h2>
          <p className="mt-1 text-sm text-muted">Register your identity provider using its SAML 2.0 metadata. SSO is restricted to existing, verified workspace accounts.</p>
        </div>
        <Card className="space-y-4 p-4 sm:p-5">
          {providers.map((provider) => (
            <div key={provider.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-bg/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">{provider.domain}</div>
                <div className="mt-1 break-all text-xs text-muted">SP metadata: {origin}/api/auth/sso/saml2/sp/metadata?providerId={encodeURIComponent(provider.providerId)}</div>
              </div>
              <Button variant="outline" disabled={busy} onClick={() => window.confirm(`Remove SSO for ${provider.domain}?`) && void act(async () => {
                await api(`/api/admin/sso/${encodeURIComponent(provider.id)}`, { method: "DELETE" });
                await load();
              })}>Remove</Button>
            </div>
          ))}
          {providers.length === 0 && (
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api("/api/admin/sso", { method: "POST", body: JSON.stringify({ domain, metadata }) });
                setDomain("");
                setMetadata("");
                await load();
              });
            }}>
              <label className="block space-y-1 text-sm font-medium">Email domain
                <input required disabled={busy} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className={inputCls} />
              </label>
              <label className="block space-y-1 text-sm font-medium">SAML metadata XML
                <textarea required disabled={busy} value={metadata} onChange={(e) => setMetadata(e.target.value)} rows={6} placeholder="<EntityDescriptor …>" className={`${inputCls} h-auto py-3 font-mono text-xs`} />
              </label>
              <Button type="submit" disabled={busy}>{busy ? "Saving provider…" : "Configure SAML provider"}</Button>
            </form>
          )}
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="display text-2xl font-semibold">Audit trail</h2>
            <p className="mt-1 text-sm text-muted">Append-only record of account and SSO administration.</p>
          </div>
          <span className="text-xs text-muted">Latest 100</span>
        </div>
        <Card className="p-0">
          {auditRows.length === 0
            ? <p className="p-4 text-sm text-muted">{loading ? "Loading audit entries…" : "No administrative changes recorded yet."}</p>
            : <ul className="divide-y divide-border">
              {auditRows.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{entry.action.replaceAll("_", " ")}</div>
                    <div className="mt-0.5 text-xs text-muted">By {entry.actor}{typeof entry.metadata?.username === "string" ? ` · @${entry.metadata.username}` : typeof entry.metadata?.domain === "string" ? ` · ${entry.metadata.domain}` : ""}</div>
                  </div>
                  <time className="text-xs text-muted" dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
                </li>
              ))}
            </ul>}
        </Card>
      </section>
    </motion.div>
  );
}
