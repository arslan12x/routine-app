import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getEnabledModulesForUser } from "@/server/services/tasks";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await requireUser();
  const enabledModules = await getEnabledModulesForUser(user.id);
  return { enabledModules };
});
