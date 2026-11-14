import { z } from "zod";
import { deriveSAMLIdentityProviderEntityID, type SAMLConfig } from "@better-auth/sso";
import { route, parseBody, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";

const providerBody = z.object({
  domain: z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a valid email domain"),
  metadata: z.string().trim().min(1).max(100_000),
});

export const GET = route(async () => {
  const admin = await requireAdmin();
  return systemDb.ssoProvider.findMany({
    where: { organizationId: admin.organizationId },
    select: { id: true, providerId: true, domain: true, issuer: true },
    orderBy: { domain: "asc" },
  });
});

export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, providerBody);
  const providerId = `saml-${body.domain.replaceAll(".", "-")}`;
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error("BETTER_AUTH_URL is required to configure SAML");
  const issuer = `${baseUrl.replace(/\/+$/, "")}/sso/${providerId}`;
  const samlConfig: SAMLConfig = {
    issuer,
    entryPoint: "",
    idpMetadata: { metadata: body.metadata },
    callbackUrl: "/tasks",
    idpInitiatedCallbackUrl: "/tasks",
  };
  try {
    deriveSAMLIdentityProviderEntityID(samlConfig);
  } catch {
    throw new ApiError(400, "VALIDATION", "Unable to parse valid SAML 2.0 identity-provider metadata");
  }

  try {
    await systemDb.$transaction(async (tx) => {
      await tx.ssoProvider.create({
        data: {
          id: crypto.randomUUID(),
          issuer,
          samlConfig: JSON.stringify(samlConfig),
          userId: admin.id,
          providerId,
          organizationId: admin.organizationId,
          domain: body.domain,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          organizationId: admin.organizationId,
          action: "SSO_PROVIDER_CREATED",
          metadata: { providerId, domain: body.domain },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new ApiError(409, "ALREADY_EXISTS", "An SSO provider already exists for this domain");
    }
    throw error;
  }

  return {
    id: providerId,
    providerId,
    domain: body.domain,
    issuer,
    serviceProviderMetadataUrl: `${baseUrl.replace(/\/+$/, "")}/api/auth/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`,
  };
}, 201);
