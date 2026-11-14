import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { listAuditLog, rethrowIfAdminSchemaMissing } from "@/server/services/admin";

export const GET = route(async () => {
  const admin = await requireAdmin();
  try {
    return await listAuditLog(admin.organizationId);
  } catch (error) {
    rethrowIfAdminSchemaMissing(error);
  }
});
