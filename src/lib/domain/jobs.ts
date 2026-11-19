export const COMPANY_CATEGORIES = [
  "STARTUP",
  "BIG_MNC",
  "BIG_SHARKS",
  "ACTIVELY_HIRING",
  "MID_MNC",
  "SMALL_SCALE",
  "FOREIGN",
] as const;

export type CompanyCategory = (typeof COMPANY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CompanyCategory, string> = {
  STARTUP: "Start-up Companies (2-Day Refresh)",
  BIG_MNC: "Big MNCs (Fortune 500)",
  BIG_SHARKS: "Big Sharks (Tech Giants & Tier-1)",
  ACTIVELY_HIRING: "Actively Hiring (Immediate Openings)",
  MID_MNC: "Mid-Market MNCs",
  SMALL_SCALE: "Small-Scale & Boutique Agencies",
  FOREIGN: "Foreign & Remote International",
};

export const APPLICATION_STAGES = [
  "TO_APPLY",
  "WAITING_FU1",
  "FOLLOW_UP_1",
  "WAITING_FU2",
  "FOLLOW_UP_2",
  "WAITING_FU3",
  "FOLLOW_UP_3",
  "REPLIED",
  "CLOSED",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const FOLLOWUP_DAY_OFFSETS = {
  APPLY: 0,
  FOLLOW_UP_1: 4,
  FOLLOW_UP_2: 10,
  FOLLOW_UP_3: 15,
} as const;

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "trashmail.com",
  "sharklasers.com",
  "yopmail.com",
]);

export function isValidHrEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(clean)) return false;

  const parts = clean.split("@");
  if (parts.length !== 2) return false;

  const domain = parts[1];
  if (DISPOSABLE_DOMAINS.has(domain)) return false;

  const domainParts = domain.split(".");
  if (domainParts.length < 2) return false;

  const tld = domainParts.at(-1);
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  return true;
}

export function extractAndValidateEmails(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const unique = Array.from(new Set(matches.map((e) => e.toLowerCase())));
  return unique.filter((email) => isValidHrEmail(email));
}

/**
 * Calculates the next stage and target action date based on the 4-stage shifting timeline:
 * - Apply (Day 0) -> WAITING_FU1 (target: appliedAt + 4 days)
 * - Follow-up 1 (Day 4) -> WAITING_FU2 (target: appliedAt + 10 days)
 * - Follow-up 2 (Day 10) -> WAITING_FU3 (target: appliedAt + 15 days)
 * - Follow-up 3 (Day 15) -> CLOSED (finished)
 */
export function calculateNextStageTransition(
  currentStage: ApplicationStage,
  appliedAt: Date
): { nextStage: ApplicationStage; nextActionAt: Date | null } {
  const baseTime = appliedAt.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  switch (currentStage) {
    case "TO_APPLY":
      return {
        nextStage: "WAITING_FU1",
        nextActionAt: new Date(baseTime + FOLLOWUP_DAY_OFFSETS.FOLLOW_UP_1 * dayMs),
      };
    case "FOLLOW_UP_1":
    case "WAITING_FU1":
      return {
        nextStage: "WAITING_FU2",
        nextActionAt: new Date(baseTime + FOLLOWUP_DAY_OFFSETS.FOLLOW_UP_2 * dayMs),
      };
    case "FOLLOW_UP_2":
    case "WAITING_FU2":
      return {
        nextStage: "WAITING_FU3",
        nextActionAt: new Date(baseTime + FOLLOWUP_DAY_OFFSETS.FOLLOW_UP_3 * dayMs),
      };
    case "FOLLOW_UP_3":
    case "WAITING_FU3":
      return {
        nextStage: "CLOSED",
        nextActionAt: null,
      };
    default:
      return {
        nextStage: currentStage,
        nextActionAt: null,
      };
  }
}

/** Evaluates whether an application waiting in a buffer state should be promoted to active follow-up tab */
export function shouldPromoteFollowUp(
  stage: ApplicationStage,
  nextActionAt: Date | null,
  now = new Date()
): ApplicationStage | null {
  if (!nextActionAt || now < nextActionAt) return null;

  if (stage === "WAITING_FU1") return "FOLLOW_UP_1";
  if (stage === "WAITING_FU2") return "FOLLOW_UP_2";
  if (stage === "WAITING_FU3") return "FOLLOW_UP_3";

  return null;
}
