"use client";
import { CalendarDays, ListChecks, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const items = [
  { href: "/tasks", label: "Tasks", Icon: ListChecks },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/insights", label: "Insights", Icon: TrendingUp },
  { href: "/friends", label: "Friends", Icon: Users },
];

export default function Nav() {
  const path = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col gap-1 border-r border-border/80 bg-card/85 p-4 shadow-[8px_0_30px_rgba(28,25,23,0.025)] backdrop-blur-xl md:flex">
        <div className="display mb-6 px-2 text-2xl font-semibold">Routine</div>
        {items.map(({ href, label, Icon }) => {
          const on = path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", on ? "bg-brand text-brandfg shadow-sm" : "text-muted hover:bg-soft hover:text-fg")}>
              <Icon size={18} /> {label}
            </Link>
          );
        })}
      </aside>
      {/* Mobile bottom bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(28,25,23,0.05)] backdrop-blur-xl md:hidden">
        <ul className="grid grid-cols-4">
          {items.map(({ href, label, Icon }) => {
            const on = path.startsWith(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined}
                  className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", on ? "text-brand" : "text-muted")}>
                  <Icon size={22} strokeWidth={on ? 2.5 : 2} /> {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
