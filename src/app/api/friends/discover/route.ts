import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { discoverFriends } from "@/server/services/friends";

export const GET = route(async () => discoverFriends(await requireUser()));
