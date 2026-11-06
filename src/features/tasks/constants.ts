export const CATEGORIES = [
  { value: "FITNESS", label: "Fitness" },
  { value: "LEARNING", label: "Learning" },
  { value: "HEALTH", label: "Health" },
  { value: "PERSONAL_DEVELOPMENT", label: "Personal development" },
  { value: "OTHER", label: "Other" },
] as const;
export const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;
export const UNITS = ["steps", "minutes", "hours", "pages", "km", "reps"];
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
