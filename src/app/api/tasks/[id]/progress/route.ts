import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { progressBody } from "@/lib/validation";
import { setProgress } from "@/server/services/tasks";
export const PUT = route<{ id: string }>(async (req, { id }) => {
  const body = await parseBody(req, progressBody);
  return setProgress(await requireUser(), id, body.date, body.value, body.updatedAt);
});
