import { route, parseBody, parseQuery } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { isValidDate } from "@/lib/domain/dates";
import { dayView } from "@/server/services/tasks";
export const GET = route<{ date: string }>(async (_req, { date }) => {
  const u = await requireUser();
  if (!isValidDate(date)) throw new ApiError(400, "VALIDATION", "Use YYYY-MM-DD");
  return dayView(u, date);
});
