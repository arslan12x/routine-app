"use client";
import { BookOpen, Briefcase, CalendarDays, ListChecks, Sparkles, TrendingUp, Trophy, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { EnabledPersonalDevModules } from "@/lib/domain/types";

const allItems = [
  { href: "/tasks", label: "Tasks", Icon: ListChecks },
  { href: "/challenges", label: "Challenges", Icon: Trophy },
  { href: "/novels", label: "Novels", Icon: BookOpen, moduleKey: "novels" as const },
  { href: "/blogs", label: "Blogs", Icon: Sparkles, moduleKey: "blogs" as const },
  { href: "/jobs", label: "Jobs", Icon: Briefcase, moduleKey: "jobs" as const },
  { href: "/finance", label: "Finance", Icon: Wallet },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/insights", label: "Insights", Icon: TrendingUp },
  { href: "/friends", label: "Friends", Icon: Users },
];

export default function Nav({ enabledModules }: { enabledModules?: EnabledPersonalDevModules }) {
  const path = usePathname();

  const items = allItems.filter((item) => {
    if (!item.moduleKey || !enabledModules) return true;
    return enabledModules[item.moduleKey] === true;
  });
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
        <ul className="flex items-center justify-start sm:justify-around overflow-x-auto py-1 px-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {items.map(({ href, label, Icon }) => {
            const on = path.startsWith(href);
            return (
              <li key={href} className="shrink-0 min-w-[3.75rem]">
                <Link href={href} aria-current={on ? "page" : undefined}
                  className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors px-1", on ? "text-brand" : "text-muted")}>
                  <Icon size={20} strokeWidth={on ? 2.5 : 2} /> {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
