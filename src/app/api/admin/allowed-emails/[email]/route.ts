import { route, parseBody, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { revokeAllowed } from "@/server/services/admin";
export const DELETE = route<{ email: string }>(async (_req, { email }) => {
  const admin = await requireAdmin();
  await revokeAllowed(admin, decodeURIComponent(email));
});
