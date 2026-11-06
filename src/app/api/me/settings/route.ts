import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { settingsPatch } from "@/lib/validation";
import { updateSettings } from "@/server/services/me";
export const PATCH = route(async (req) => {
  const u = await requireUser();
  await updateSettings(u, await parseBody(req, settingsPatch));
  return { ok: true };
});
