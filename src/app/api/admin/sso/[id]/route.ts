import { route, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { rethrowIfAdminSchemaMissing } from "@/server/services/admin";

export const DELETE = route<{ id: string }>(async (_request, { id }) => {
  const admin = await requireAdmin();
  let provider;
  try {
    provider = await systemDb.ssoProvider.findFirst({
      where: { id: decodeURIComponent(id), organizationId: admin.organizationId },
      select: { id: true, providerId: true, domain: true },
    });
  } catch (error) {
    rethrowIfAdminSchemaMissing(error);
  }
  if (!provider) throw new ApiError(404, "NOT_FOUND", "SSO provider not found");

  try {
    await systemDb.$transaction(async (tx) => {
      await tx.ssoProvider.delete({ where: { id: provider.id } });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          organizationId: admin.organizationId,
          action: "SSO_PROVIDER_REMOVED",
          metadata: { providerId: provider.providerId, domain: provider.domain },
        },
      });
    });
  } catch (error) {
    rethrowIfAdminSchemaMissing(error);
  }
});
