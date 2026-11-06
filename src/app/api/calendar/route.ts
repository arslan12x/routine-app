import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { monthQuery } from "@/lib/validation";
import { calendar } from "@/server/services/stats";
export const GET = route(async (req) => calendar(await requireUser(), parseQuery(req, monthQuery).month));
