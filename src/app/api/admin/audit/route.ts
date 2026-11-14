import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listAuditLog } from "@/server/services/admin";

export const GET = route(async () => {
  const admin = await requireAdmin();
  return listAuditLog(admin.organizationId);
});
