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

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "test.com",
  "invalid",
  "localhost",
  "yourcompany.com",
  "company.com",
  "domain.com",
  "email.com",
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "trashmail.com",
  "yopmail.com",
  "sharklasers.com",
]);

/**
 * Strict RFC-compliant email validation that rejects empty strings, spaces,
 * double dots, invalid TLDs, and placeholder domains.
 */
export function isValidEmailAddress(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) return false;
  if (/\s/.test(clean)) return false;
  if (clean.includes("..")) return false;

  const parts = clean.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;

  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean)) return false;

  if (PLACEHOLDER_DOMAINS.has(domain)) return false;

  const domainParts = domain.split(".");
  if (domainParts.length < 2) return false;

  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  return true;
}

export interface SanitizedEmailResult {
  subject: string;
  body: string;
  html: string;
  issues: string[];
}

/**
 * Strips raw Markdown artifacts, checks for unresolved template placeholders,
 * and formats crisp, responsive HTML alongside plain-text email content.
 */
export function sanitizeEmailContent(subject: string, body: string): SanitizedEmailResult {
  const issues: string[] = [];

  // 1. Sanitize subject
  let cleanSubject = (subject || "").trim();
  cleanSubject = cleanSubject
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/g, "")
    .trim();

  // 2. Sanitize body
  let cleanBody = (body || "").trim();

  // Detect unresolved placeholders in subject and body
  const placeholderRegex =
    /\[(?:Your\s+Name|Candidate\s+Name|Company\s+Name|Target\s+Company|Hiring\s+Manager|Team\s+Lead|Phone|Phone\s+Number|Link|Portfolio|Resume|Date|Insert[^\s\]]*)\]|<insert[^>]*>|<your[^>]*>/gi;

  const foundPlaceholders = [
    ...(cleanSubject.match(placeholderRegex) || []),
    ...(cleanBody.match(placeholderRegex) || []),
  ];

  // Generic bracket check for unresolved templates: e.g. [Insert Specific Metric] or [Company]
  const genericBrackets = cleanBody.match(/\[[A-Z][a-zA-Z\s/_-]{2,35}\]/g) || [];
  for (const b of genericBrackets) {
    if (!foundPlaceholders.includes(b)) {
      foundPlaceholders.push(b);
    }
  }

  if (foundPlaceholders.length > 0) {
    issues.push(
      `Unresolved template placeholders detected: ${Array.from(new Set(foundPlaceholders)).join(", ")}`
    );
  }

  // Strip Markdown artifacts from body
  cleanBody = cleanBody
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\*])\*([^*]+)\*([^\*]|$)/g, "$1$2$3")
    .replace(/(^|[^_])_([^_]+)_([^_]|$)/g, "$1$2$3")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#+\s+(.+)$/gm, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  cleanBody = cleanBody.replace(/[ \t]+/g, " ");
  cleanBody = cleanBody.replace(/\n{3,}/g, "\n\n").trim();

  // 3. Generate responsive HTML
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const paragraphs = cleanBody
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const htmlParagraphs = paragraphs.map((p) => {
    const formatted = escapeHtml(p).replace(/\n/g, "<br/>");
    return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${formatted}</p>`;
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 16px; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1f2937;">
  <div style="max-width: 600px; margin: 0 auto;">
    ${htmlParagraphs.join("\n    ")}
  </div>
</body>
</html>
`.trim();

  return {
    subject: cleanSubject,
    body: cleanBody,
    html,
    issues,
  };
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
