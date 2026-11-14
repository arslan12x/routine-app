import { route, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { accountCreateBody } from "@/lib/validation";
import { addAllowed, listAllowed } from "@/server/services/admin";

export const GET = route(async () => {
  const admin = await requireAdmin();
  return listAllowed(admin.organizationId);
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, accountCreateBody);
  return addAllowed(admin, body.username, body.email, body.password, body.role);
}, 201);
