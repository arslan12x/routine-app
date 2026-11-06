export interface BoardRow {
  displayName: string;
  image: string | null;
  currentStreak: number;
  longestStreak: number;
  consistency: number | null;
  successDays: number;
  mandatoryPerDay: number;
  joinedAt: string; // ISO timestamp
  tiebreakId: string; // never sent to clients
}

/** Deterministic: streak, consistency (null last), success days, longest streak, earliest joiner, id. */
export function rankRows<T extends BoardRow>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.currentStreak - a.currentStreak ||
      (b.consistency ?? -1) - (a.consistency ?? -1) ||
      b.successDays - a.successDays ||
      b.longestStreak - a.longestStreak ||
      (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0) ||
      (a.tiebreakId < b.tiebreakId ? -1 : 1),
  );
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}
