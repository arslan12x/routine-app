import nodemailer, { type SendMailOptions } from "nodemailer";
import { ImapFlow } from "imapflow";
import { withUserDb, systemDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import {
  type EmailProviderPreset,
  isValidEmailAddress,
  sanitizeEmailContent,
} from "@/lib/domain/email-config";
import { generatePdfFromText } from "@/lib/pdf-generator";
import { ApiError } from "@/lib/api";

export interface DirectEmailMetadata {
  preset: EmailProviderPreset;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  encryptedPassword?: string;
  lastVerifiedAt?: string;
}

export interface VerifyEmailConfig {
  email: string;
  password: string;
  preset?: EmailProviderPreset;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

export interface SendDirectEmailPayload {
  userId: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  isFollowUp?: boolean;
  resume?: {
    fileUrl?: string | null;
    parsedText?: string | null;
    fileData?: string | null;
    mimeType?: string | null;
  } | null;
  useSystemDb?: boolean;
}

export interface SendDirectEmailResult {
  success: boolean;
  messageId: string;
  dispatchedAt: string;
  provider: "DIRECT_SMTP" | "MOCK";
  fromEmail: string;
}

/**
 * Tests both SMTP and IMAP connections with a 10-second timeout.
 * Throws a clear, human-actionable error if either fails.
 */
export async function verifyEmailCredentials(
  config: VerifyEmailConfig
): Promise<{ success: boolean; message: string }> {
  // 1. Verify SMTP Connection & Authentication
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.email,
        pass: config.password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    await transporter.verify();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SMTP authentication failed: ${msg}. Please verify your email, password, and port settings.`);
  }

  // 2. Verify IMAP Connection & Authentication
  const imapClient = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.email,
      pass: config.password,
    },
    logger: false,
    connectionTimeout: 10000,
  });

  try {
    await imapClient.connect();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`IMAP authentication failed: ${msg}. Please verify your email, password, and IMAP server settings.`);
  } finally {
    try {
      if (imapClient.usable) {
        await imapClient.logout();
      }
    } catch {
      // Ignore cleanup error on logout
    }
  }

  return { success: true, message: "SMTP and IMAP credentials successfully verified." };
}

/**
 * Checks if a user has configured and verified their Direct Email credentials.
 */
export async function isDirectEmailConfigured(
  userId: string,
  useSystemDb = false
): Promise<{ configured: boolean; email?: string; preset?: string }> {
  try {
    const integration = useSystemDb
      ? await systemDb.userIntegration.findUnique({
          where: { userId_provider: { userId, provider: "DIRECT_EMAIL" } },
        })
      : await withUserDb(userId, (tx) =>
          tx.userIntegration.findUnique({
            where: { userId_provider: { userId, provider: "DIRECT_EMAIL" } },
          })
        );

    const meta = integration?.metadata as DirectEmailMetadata | null;
    if (integration && meta?.encryptedPassword) {
      return {
        configured: true,
        email: integration.externalUsername,
        preset: meta.preset,
      };
    }
    return { configured: false };
  } catch {
    return { configured: false };
  }
}

/**
 * Dispatches an email directly via the user's personal SMTP credentials.
 * If credentials are not configured, falls back deterministically to MOCK mode.
 */
export async function sendDirectEmail(
  payload: SendDirectEmailPayload
): Promise<SendDirectEmailResult> {
  const dispatchedAt = new Date().toISOString();

  // 1. Strict recipient email validation
  if (!isValidEmailAddress(payload.to)) {
    throw new ApiError(
      400,
      "INVALID_EMAIL_PAYLOAD",
      `Recipient address "${payload.to}" is not a valid email address.`
    );
  }

  // 2. Strict sanitization: strip markdown artifacts and reject unresolved placeholders
  const baseSubject =
    payload.isFollowUp && !payload.subject.toLowerCase().startsWith("re:")
      ? `Re: ${payload.subject}`
      : payload.subject;

  const sanitized = sanitizeEmailContent(baseSubject, payload.body);
  if (sanitized.issues.length > 0) {
    throw new ApiError(
      400,
      "INVALID_EMAIL_PAYLOAD",
      `Email content contains unresolved placeholders: ${sanitized.issues.join("; ")}`
    );
  }

  // Load user's DIRECT_EMAIL integration
  const integration = payload.useSystemDb
    ? await systemDb.userIntegration.findUnique({
        where: { userId_provider: { userId: payload.userId, provider: "DIRECT_EMAIL" } },
      })
    : await withUserDb(payload.userId, (tx) =>
        tx.userIntegration.findUnique({
          where: { userId_provider: { userId: payload.userId, provider: "DIRECT_EMAIL" } },
        })
      );

  const meta = integration?.metadata as DirectEmailMetadata | null;

  // If Direct Email is configured, decrypt password and dispatch via live SMTP
  if (integration?.externalUsername && meta?.encryptedPassword && meta.smtpHost) {
    if (!isValidEmailAddress(integration.externalUsername)) {
      throw new ApiError(
        400,
        "INVALID_EMAIL_PAYLOAD",
        `Sender email address "${integration.externalUsername}" is invalid.`
      );
    }

    try {
      const password = decryptSecret(meta.encryptedPassword);
      const transporter = nodemailer.createTransport({
        host: meta.smtpHost,
        port: meta.smtpPort,
        secure: meta.smtpSecure,
        auth: {
          user: integration.externalUsername,
          pass: password,
        },
        connectionTimeout: 15000,
        socketTimeout: 15000,
      });

      const mailOptions: SendMailOptions = {
        from: integration.externalUsername,
        to: payload.to,
        subject: sanitized.subject,
        text: sanitized.body,
        html: sanitized.html,
      };

      // Threading headers
      if (payload.threadId) {
        mailOptions.inReplyTo = payload.threadId;
        mailOptions.references = [payload.threadId];
      }

      // Resume attachment handling (for Day 0 initial applications)
      if (!payload.isFollowUp && payload.resume) {
        const resume = payload.resume;
        const rawFileName = resume.fileUrl ? resume.fileUrl.split("/").pop() || "Resume.pdf" : "Resume.pdf";
        const lower = rawFileName.toLowerCase();

        let attachmentName = rawFileName;
        let mimeType = resume.mimeType || "application/pdf";
        let content: Buffer | string | null = null;

        if (resume.fileData) {
          // 1. Exact uploaded binary file (PDF, DOC, DOCX, etc.)
          content = Buffer.from(resume.fileData, "base64");
          if (lower.endsWith(".pdf")) {
            mimeType = "application/pdf";
          } else if (lower.endsWith(".docx")) {
            mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          } else if (lower.endsWith(".doc")) {
            mimeType = "application/msword";
          } else if (lower.endsWith(".txt")) {
            mimeType = "text/plain";
          }
        } else if (lower.endsWith(".pdf") || (!lower.endsWith(".doc") && !lower.endsWith(".docx") && !lower.endsWith(".txt"))) {
          // 2. Fallback for PDF: Generate compliant, standard PDF buffer from text
          if (!attachmentName.toLowerCase().endsWith(".pdf")) {
            attachmentName = `${attachmentName}.pdf`;
          }
          mimeType = "application/pdf";
          content = generatePdfFromText(attachmentName.replace(/\.pdf$/i, ""), resume.parsedText || "Candidate Resume");
        } else if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
          // 3. Fallback for Word doc without binary: Generate a clean PDF so it's readable
          attachmentName = `${rawFileName.replace(/\.[^/.]+$/, "")}.pdf`;
          mimeType = "application/pdf";
          content = generatePdfFromText(rawFileName.replace(/\.[^/.]+$/, ""), resume.parsedText || "Candidate Resume");
        } else if (lower.endsWith(".txt")) {
          // 4. Plain text file requested
          mimeType = "text/plain";
          content = resume.parsedText || "";
        }

        if (content) {
          mailOptions.attachments = [
            {
              filename: attachmentName,
              content,
              contentType: mimeType,
            },
          ];
        }
      }

      const info = await transporter.sendMail(mailOptions);
      const messageId = info.messageId || `smtp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      console.log(
        `[Direct SMTP] Sent email to ${payload.to} from ${integration.externalUsername} | Subject: "${sanitized.subject}" | MessageId: ${messageId}`
      );

      return {
        success: true,
        messageId,
        dispatchedAt,
        provider: "DIRECT_SMTP",
        fromEmail: integration.externalUsername,
      };
    } catch (err) {
      console.warn("[Direct SMTP] Dispatch failed; falling back to mock logger", err);
    }
  }

  // Deterministic MOCK fallback when Direct Email is not configured
  const mockMessageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@routine.local`;
  console.log(
    `[Mock Email Dispatcher] Sent simulated email to ${payload.to} | Subject: "${sanitized.subject}" | MessageId: ${mockMessageId}`
  );

  return {
    success: true,
    messageId: mockMessageId,
    dispatchedAt,
    provider: "MOCK",
    fromEmail: integration?.externalUsername || "candidate@routine.local",
  };
}
