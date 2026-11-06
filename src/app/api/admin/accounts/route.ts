import { route, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { accountCreateBody } from "@/lib/validation";
import { addAllowed, listAllowed } from "@/server/services/admin";

export const GET = route(async () => {
  await requireAdmin();
  return listAllowed();
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, accountCreateBody);
  return addAllowed(admin, body.username, body.password, body.role);
}, 201);
