import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { streaks } from "@/server/services/stats";
export const GET = route(async () => streaks(await requireUser()));
