import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { profile } from "@/server/services/me";
export const GET = route(async () => profile(await requireUser()));
