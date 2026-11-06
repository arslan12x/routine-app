import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { exportAll } from "@/server/services/stats";
export const GET = route(async () => exportAll(await requireUser()));
