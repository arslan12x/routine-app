import { route, parseBody, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { allowedEmailBody } from "@/lib/validation";
import { addAllowed, listAllowed } from "@/server/services/admin";
export const GET = route(async () => {
  await requireAdmin();
  return listAllowed();
});
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseBody(req, allowedEmailBody);
  return addAllowed(admin, b.email, b.role);
}, 201);
