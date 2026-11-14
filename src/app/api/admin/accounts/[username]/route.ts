import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { restoreAllowed, revokeAllowed } from "@/server/services/admin";

export const DELETE = route<{ username: string }>(async (_req, { username }) => {
  const admin = await requireAdmin();
  await revokeAllowed(admin, decodeURIComponent(username));
});

export const POST = route<{ username: string }>(async (_req, { username }) => {
  const admin = await requireAdmin();
  await restoreAllowed(admin, decodeURIComponent(username));
});
