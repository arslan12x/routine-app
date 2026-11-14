/**
 * Evaluates whether an incoming mutation payload should be rejected under Last-Write-Wins (LWW).
 * Returns true if the database record's existing updatedAt is newer than the incoming client payload's timestamp.
 */
export function shouldRejectStaleWrite(
  existingUpdatedAt: Date | string | null | undefined,
  clientUpdatedAt: string | null | undefined,
): boolean {
  if (!existingUpdatedAt || !clientUpdatedAt) return false;
  const existingTime = existingUpdatedAt instanceof Date ? existingUpdatedAt.getTime() : new Date(existingUpdatedAt).getTime();
  const clientTime = new Date(clientUpdatedAt).getTime();
  if (isNaN(existingTime) || isNaN(clientTime)) return false;
  return existingTime > clientTime;
}
