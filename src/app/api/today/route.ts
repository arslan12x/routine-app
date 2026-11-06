import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { dateQuery } from "@/lib/validation";
import { dayView } from "@/server/services/tasks";
export const GET = route(async (req) => {
  const u = await requireUser();
  const q = parseQuery(req, dateQuery);
  return dayView(u, q.date ?? todayIn(u.timezone));
});
