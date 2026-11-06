import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { taskPatch } from "@/lib/validation";
import { deleteTask, updateTask } from "@/server/services/tasks";
export const PATCH = route<{ id: string }>(async (req, { id }) => updateTask(await requireUser(), id, await parseBody(req, taskPatch)));
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await deleteTask(await requireUser(), id);
});
