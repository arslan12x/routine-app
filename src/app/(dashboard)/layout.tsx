import { Settings, Shield } from "lucide-react";
import Link from "next/link";
import Nav from "@/components/Nav";
import TimezoneSync from "@/components/TimezoneSync";
import { pageUser } from "@/lib/auth/session";
import { getEnabledModulesForUser } from "@/server/services/tasks";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const enabledModules = await getEnabledModulesForUser(user.id);

  return (
    <div className="min-h-dvh md:pl-56">
      <Nav enabledModules={enabledModules} />
      <TimezoneSync isSet={user.timezoneSet} />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 sm:px-6 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <span className="display text-lg font-semibold md:invisible">Routine</span>
        <div className="flex gap-1">
          {user.role === "ADMIN" && <Link href="/admin" aria-label="Admin" className="grid size-10 place-items-center rounded-full hover:bg-soft"><Shield size={18} /></Link>}
          <Link href="/settings" aria-label="Settings" className="grid size-10 place-items-center rounded-full hover:bg-soft"><Settings size={18} /></Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-28 pt-2 md:pb-10 min-w-0">{children}</main>
    </div>
  );
}
