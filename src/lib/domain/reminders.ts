export const REMINDER_HOURS = [21, 22, 23] as const;
export const REMINDER_WINDOW_MINUTES = 5;

export interface ReminderSlot {
  date: string;
  hour: (typeof REMINDER_HOURS)[number];
}

export function getReminderSlot(now: Date, timezone: string): ReminderSlot | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (!REMINDER_HOURS.includes(hour as (typeof REMINDER_HOURS)[number]) || minute >= REMINDER_WINDOW_MINUTES) return null;
  return { date: `${values.year}-${values.month}-${values.day}`, hour: hour as ReminderSlot["hour"] };
}

export function isReminderHour(now: Date, timezone: string, slot: ReminderSlot): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}` === slot.date && Number(values.hour) === slot.hour;
}

export function reminderMessage(remainingTasks: number, reminderHour: number): string {
  const hoursLeft = 24 - reminderHour;
  const taskLabel = remainingTasks === 1 ? "task" : "tasks";
  const hourLabel = hoursLeft === 1 ? "hour" : "hours";
  return `You have ${remainingTasks} ${taskLabel} left and ${hoursLeft} ${hourLabel} before the day ends.`;
}
