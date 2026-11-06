export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export const fmtNum = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
export const pct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);
