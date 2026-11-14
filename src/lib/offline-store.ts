import { get, set } from "idb-keyval";
import { api, ApiRequestError } from "@/lib/fetcher";
import type { DayView } from "@/server/services/tasks";

export interface QueuedProgress {
  id: string;
  taskId: string;
  date: string;
  value: number;
  updatedAt: string;
}

const todayCacheKey = (userId: string) => `routine:today:${userId}`;
const progressQueueKey = (userId: string) => `routine:offline-progress:${userId}`;
const queueLocks = new Map<string, Promise<void>>();
const queueSyncs = new Map<string, Promise<void>>();

export async function cacheToday(userId: string, data: DayView): Promise<void> {
  await set(todayCacheKey(userId), data);
}

export async function getCachedToday(userId: string): Promise<DayView | undefined> {
  return get<DayView>(todayCacheKey(userId));
}

async function updateQueue(userId: string, update: (queue: QueuedProgress[]) => QueuedProgress[]): Promise<void> {
  const key = progressQueueKey(userId);
  const previous = queueLocks.get(key) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const current = (await get<QueuedProgress[]>(key)) ?? [];
      await set(key, update(current));
    });
  queueLocks.set(key, operation);
  try {
    await operation;
  } finally {
    if (queueLocks.get(key) === operation) queueLocks.delete(key);
  }
}

export async function enqueueProgress(
  userId: string,
  mutation: { taskId: string; date: string; value: number; updatedAt?: string },
): Promise<void> {
  const updatedAt = mutation.updatedAt ?? new Date().toISOString();
  await updateQueue(userId, (queue) => [
    ...queue,
    { ...mutation, updatedAt, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
  ]);
}

export async function syncOfflineProgress(userId: string): Promise<void> {
  const existingSync = queueSyncs.get(userId);
  if (existingSync) return existingSync;

  const sync = (async () => {
    while (navigator.onLine) {
      const queue = (await get<QueuedProgress[]>(progressQueueKey(userId))) ?? [];
      const next = queue[0];
      if (!next) return;

      try {
        await api(`/api/tasks/${next.taskId}/progress`, {
          method: "PUT",
          body: JSON.stringify({
            date: next.date,
            value: next.value,
            updatedAt: next.updatedAt ?? new Date().toISOString(),
          }),
        });
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 409) {
          // Conflict: DB has a newer write (LWW). Drop stale offline mutation so queue is not blocked.
          console.warn(`[Offline] Dropping stale update for task ${next.taskId}: newer write exists on server.`);
          await updateQueue(userId, (current) => current.filter(({ id }) => id !== next.id));
          continue;
        }
        throw error;
      }
      await updateQueue(userId, (current) => current.filter(({ id }) => id !== next.id));
    }
  })();
  queueSyncs.set(userId, sync);
  try {
    await sync;
  } finally {
    if (queueSyncs.get(userId) === sync) queueSyncs.delete(userId);
  }
}
