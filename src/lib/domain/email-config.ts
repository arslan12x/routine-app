export type EmailProviderPreset = "GMAIL" | "OUTLOOK" | "ZOHO" | "CUSTOM";

export interface EmailServerPresetConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
}

export const EMAIL_PRESETS: Record<EmailProviderPreset, EmailServerPresetConfig> = {
  GMAIL: {
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
  },
  OUTLOOK: {
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
  },
  ZOHO: {
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.zoho.com",
    imapPort: 993,
    imapSecure: true,
  },
  CUSTOM: {
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
  },
};

export function getEmailProviderPreset(preset: EmailProviderPreset): EmailServerPresetConfig {
  return EMAIL_PRESETS[preset] || EMAIL_PRESETS.CUSTOM;
}

export interface IncomingEmailHeader {
  from: string;
  subject?: string;
  inReplyTo?: string | null;
  references?: string[] | string | null;
  date?: Date | string | null;
  messageId?: string;
}

export interface TargetJobApp {
  id: string;
  hrEmail: string;
  emailThreadId?: string | null;
  jobTitle?: string;
  companyName?: string;
}

export function extractEmailAddress(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].trim().toLowerCase();
  }
  return raw.trim().toLowerCase();
}

function cleanMessageId(id?: string | null): string {
  if (!id) return "";
  return id.replace(/^<|>$/g, "").trim().toLowerCase();
}

/**
 * Pure domain matcher: determines if an incoming email message is a recruiter reply
 * to an active JobApplication.
 *
 * Rules:
 * 1. Sender cannot be the user's own email.
 * 2. Matches if:
 *    - In-Reply-To or References contains the application's emailThreadId, OR
 *    - Normalized sender email matches application.hrEmail
 */
export function matchRecruiterReply(
  incoming: IncomingEmailHeader,
  application: TargetJobApp,
  userEmail: string
): boolean {
  const senderEmail = extractEmailAddress(incoming.from);
  const normalizedUserEmail = extractEmailAddress(userEmail);

  // Ignore user's own sent messages
  if (!senderEmail || (normalizedUserEmail && senderEmail === normalizedUserEmail)) {
    return false;
  }

  // Check thread ID match
  const appThreadId = cleanMessageId(application.emailThreadId);
  if (appThreadId) {
    if (incoming.inReplyTo && cleanMessageId(incoming.inReplyTo).includes(appThreadId)) {
      return true;
    }

    if (incoming.references) {
      if (Array.isArray(incoming.references)) {
        if (incoming.references.some((ref) => cleanMessageId(ref).includes(appThreadId))) {
          return true;
        }
      } else if (typeof incoming.references === "string") {
        if (cleanMessageId(incoming.references).includes(appThreadId)) {
          return true;
        }
      }
    }
  }

  // Check sender email match against application HR email
  const normalizedHrEmail = extractEmailAddress(application.hrEmail);
  if (normalizedHrEmail && senderEmail === normalizedHrEmail) {
    return true;
  }

  return false;
}
