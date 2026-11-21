import { route, parseBody, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { withUserDb } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { emailConfigPut } from "@/lib/validation";
import { getEmailProviderPreset, type EmailProviderPreset } from "@/lib/domain/email-config";
import type { Prisma } from "@/generated/prisma/client";
import {
  verifyEmailCredentials,
  type DirectEmailMetadata,
} from "@/server/services/email-transport";
import { saveCandidateProfile } from "@/server/services/jobs";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await requireUser();

  const integration = await withUserDb(user.id, (tx) =>
    tx.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "DIRECT_EMAIL",
        },
      },
    })
  );

  if (!integration) {
    const gmailPreset = getEmailProviderPreset("GMAIL");
    return {
      connected: false,
      preset: "GMAIL",
      email: "",
      smtpHost: gmailPreset.smtpHost,
      smtpPort: gmailPreset.smtpPort,
      smtpSecure: gmailPreset.smtpSecure,
      imapHost: gmailPreset.imapHost,
      imapPort: gmailPreset.imapPort,
      imapSecure: gmailPreset.imapSecure,
      lastVerifiedAt: null,
      lastSyncedAt: null,
      lastStatus: "NOT_CONFIGURED",
    };
  }

  const meta = integration.metadata as DirectEmailMetadata | null;
  return {
    connected: Boolean(meta?.encryptedPassword),
    preset: meta?.preset || "GMAIL",
    email: integration.externalUsername,
    smtpHost: meta?.smtpHost || "",
    smtpPort: meta?.smtpPort ?? 465,
    smtpSecure: meta?.smtpSecure ?? true,
    imapHost: meta?.imapHost || "",
    imapPort: meta?.imapPort ?? 993,
    imapSecure: meta?.imapSecure ?? true,
    lastVerifiedAt: meta?.lastVerifiedAt || null,
    lastSyncedAt: integration.lastSyncedAt?.toISOString() || null,
    lastStatus: integration.lastStatus,
  };
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, emailConfigPut);

  const presetDefaults = getEmailProviderPreset(body.preset as EmailProviderPreset);
  const smtpHost = body.smtpHost?.trim() || presetDefaults.smtpHost;
  const smtpPort = body.smtpPort ?? presetDefaults.smtpPort;
  const smtpSecure = body.smtpSecure ?? presetDefaults.smtpSecure;
  const imapHost = body.imapHost?.trim() || presetDefaults.imapHost;
  const imapPort = body.imapPort ?? presetDefaults.imapPort;
  const imapSecure = body.imapSecure ?? presetDefaults.imapSecure;

  if (!smtpHost || !imapHost) {
    throw new ApiError(400, "MISSING_SERVER_HOST", "SMTP and IMAP host addresses are required.");
  }

  // 1. Live test credentials on both SMTP and IMAP
  try {
    await verifyEmailCredentials({
      email: body.email.trim(),
      password: body.password.trim(),
      preset: body.preset as EmailProviderPreset,
      smtpHost,
      smtpPort,
      smtpSecure,
      imapHost,
      imapPort,
      imapSecure,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(400, "EMAIL_VERIFICATION_FAILED", message);
  }

  // 2. Encrypt App Password safely
  const encryptedPassword = encryptSecret(body.password.trim());
  const now = new Date();

  // 3. Persist in UserIntegration
  const metadata: DirectEmailMetadata = {
    preset: body.preset as EmailProviderPreset,
    smtpHost,
    smtpPort,
    smtpSecure,
    imapHost,
    imapPort,
    imapSecure,
    encryptedPassword,
    lastVerifiedAt: now.toISOString(),
  };

  await withUserDb(user.id, (tx) =>
    tx.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "DIRECT_EMAIL",
        },
      },
      create: {
        userId: user.id,
        provider: "DIRECT_EMAIL",
        externalUsername: body.email.trim(),
        lastStatus: "VERIFIED",
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
      update: {
        externalUsername: body.email.trim(),
        lastStatus: "VERIFIED",
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    })
  );

  // Synchronize candidate job profile sender email
  await saveCandidateProfile(user.id, { email: body.email.trim() });

  return {
    connected: true,
    preset: body.preset,
    email: body.email.trim(),
    smtpHost,
    smtpPort,
    smtpSecure,
    imapHost,
    imapPort,
    imapSecure,
    lastVerifiedAt: now.toISOString(),
    lastStatus: "VERIFIED",
  };
});

export const DELETE = route(async () => {
  const user = await requireUser();

  await withUserDb(user.id, (tx) =>
    tx.userIntegration.deleteMany({
      where: {
        userId: user.id,
        provider: "DIRECT_EMAIL",
      },
    })
  );

  return { success: true };
});
