"use client";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, inputCls } from "@/components/ui";
import { api } from "@/lib/fetcher";
import SignOutButton from "./SignOutButton";

interface S { timezone: string; weekStartsOn: 1 | 7; displayName: string | null; showOnLeaderboard: boolean }

export default function SettingsForm({ initial, email }: { initial: S; email: string }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Asia/Kolkata", "UTC"];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/me/settings", { method: "PATCH", body: JSON.stringify({ ...s, displayName: s.displayName?.trim() || null }) });
      setMsg("Saved"); router.refresh();
    } catch (er) { setMsg(er instanceof Error ? er.message : "Failed"); }
  }
  async function exportData() {
    const d = await api("/api/export");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = "routine-export.json"; a.click(); URL.revokeObjectURL(a.href);
  }
  const lbl = "mb-1 block text-xs font-medium text-muted";
  return (
    <>
      <h1 className="display mt-2 text-3xl font-semibold">Settings</h1>
      <p className="text-sm text-muted">{email}</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div><label className={lbl} htmlFor="s-name">Display name (shown to friends)</label><input id="s-name" maxLength={30} className={inputCls} value={s.displayName ?? ""} onChange={(e) => setS({ ...s, displayName: e.target.value })} placeholder="Your name" /></div>
        <div><label className={lbl} htmlFor="s-tz">Timezone</label><input id="s-tz" list="zones" className={inputCls} value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} /><datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist></div>
        <div><label className={lbl} htmlFor="s-wk">Week starts on</label><select id="s-wk" className={inputCls} value={s.weekStartsOn} onChange={(e) => setS({ ...s, weekStartsOn: Number(e.target.value) as 1 | 7 })}><option value={1}>Monday</option><option value={7}>Sunday</option></select></div>
        <label className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-card px-3 text-sm"><span>Show me on the friends leaderboard</span><input type="checkbox" className="size-5 accent-[var(--brand)]" checked={s.showOnLeaderboard} onChange={(e) => setS({ ...s, showOnLeaderboard: e.target.checked })} /></label>
        <div><label className={lbl} htmlFor="s-theme">Theme</label><select id="s-theme" className={inputCls} value={theme ?? "system"} onChange={(e) => setTheme(e.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
        <Button type="submit" className="w-full">Save</Button>
        {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
      </form>
      <Card className="mt-6 space-y-2 text-sm">
        <div className="font-medium">Install the app</div>
        <p className="text-muted"><b>iPhone:</b> open in Safari, tap Share, then Add to Home Screen. <b>Android:</b> Chrome menu, then Install app.</p>
      </Card>
      <div className="mt-6 flex gap-2"><Button variant="outline" onClick={exportData}>Export my data</Button><SignOutButton /></div>
    </>
  );
}
