import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { insightsQuery } from "@/lib/validation";
import { insights } from "@/server/services/stats";
export const GET = route(async (req) => insights(await requireUser(), parseQuery(req, insightsQuery)));
