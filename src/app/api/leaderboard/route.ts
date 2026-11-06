import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { leaderboard } from "@/server/services/stats";
export const GET = route(async () => leaderboard(await requireUser()));
