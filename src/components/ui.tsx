import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-brandfg hover:opacity-90",
  outline: "border border-border bg-card hover:bg-soft",
  ghost: "hover:bg-soft",
  danger: "bg-bad text-white hover:opacity-90",
};

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50", variants[variant], className)}
    />
  );
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)}>{children}</div>
);

export const Stat = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <Card className="p-3">
    <div className="text-xs text-muted">{label}</div>
    <div className="display mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    {hint && <div className="text-xs text-muted">{hint}</div>}
  </Card>
);

export function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid place-items-center rounded-full bg-soft font-semibold" style={{ width: size, height: size }} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Ring({ pct, size = 84, label }: { pct: number; size?: number; label?: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Progress"} ${pct}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--brand)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">{pct}%</div>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded-xl bg-soft", className)} />;

export const Empty = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="rounded-2xl border border-dashed border-border p-8 text-center">
    <div className="font-medium">{title}</div>
    {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
  </div>
);

export const inputCls = "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm";
