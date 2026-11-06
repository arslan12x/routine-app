import type { DateStr } from "./types.ts";

export const parse = (d: DateStr): Date => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
export const fmt = (dt: Date): DateStr => dt.toISOString().slice(0, 10);
export const addDays = (d: DateStr, n: number): DateStr => {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
};
/** ISO weekday: 1 = Monday ... 7 = Sunday */
export const isoWeekday = (d: DateStr): number => {
  const w = parse(d).getUTCDay();
  return w === 0 ? 7 : w;
};
export const daysBetween = (from: DateStr, to: DateStr): DateStr[] => {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
export const isValidDate = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && fmt(parse(d)) === d;
export const monthOf = (d: DateStr): string => d.slice(0, 7);
export const monthRange = (month: string): [DateStr, DateStr] => {
  const from = `${month}-01`;
  const next = parse(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return [from, addDays(fmt(next), -1)];
};
/** The user's current local calendar date in an IANA timezone. */
export const todayIn = (timeZone: string, now: Date = new Date()): DateStr =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export const hourIn = (timeZone: string, now: Date = new Date()): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
export const isValidTimezone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};
export const weekStart = (d: DateStr, weekStartsOn: 1 | 7): DateStr => {
  const w = isoWeekday(d);
  return addDays(d, -(weekStartsOn === 1 ? w - 1 : w % 7));
};
export const longDate = (d: DateStr): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(parse(d));
