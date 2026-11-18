import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getUserReadingSessions } from "@/server/services/novels";

export const GET = route(async () => {
  const user = await requireUser();
  const sessions = await getUserReadingSessions(user.id);
  return { sessions };
});
