import { Settings, Shield } from "lucide-react";
import Link from "next/link";
import Nav from "@/components/Nav";
import TimezoneSync from "@/components/TimezoneSync";
import { pageUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  return (
    <div className="min-h-dvh md:pl-56">
      <Nav />
      <TimezoneSync isSet={user.timezoneSet} />
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <span className="display text-lg font-semibold md:invisible">Routine</span>
        <div className="flex gap-1">
          {user.role === "ADMIN" && <Link href="/admin" aria-label="Admin" className="grid size-10 place-items-center rounded-full hover:bg-soft"><Shield size={18} /></Link>}
          <Link href="/settings" aria-label="Settings" className="grid size-10 place-items-center rounded-full hover:bg-soft"><Settings size={18} /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-2 md:pb-10">{children}</main>
    </div>
  );
}
