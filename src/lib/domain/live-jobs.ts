import { inferExperienceLevelFromTitle, type CandidateExperienceLevel } from "./jobs";

export interface RawLiveJob {
  externalId: string;
  title: string;
  url: string;
  location: string;
  companyName: string;
  companySlug?: string;
  atsProvider: "GREENHOUSE" | "LEVER" | "ASHBY" | "REMOTIVE" | "ARBEITNOW" | "HIMALAYAS" | "JOBICY" | "REMOTEOK";
  postedAt?: Date | null;
  descriptionSnippet?: string;
  jobDescription?: string | null;
  category?: string;
  hrEmail?: string;
}

export interface NormalizedLiveJob {
  externalJobId: string;
  title: string;
  jobUrl: string;
  jobLocation: string;
  companyName: string;
  companyCategory: string;
  hrEmail: string;
  atsProvider: string;
  postedAt: Date | string | null;
  jobDescription?: string | null;
  atsMatchScore?: number | null;
  atsBreakdownJson?: string | null;
  experienceLevel: CandidateExperienceLevel;
  isIndiaBased: boolean;
  offersRemoteIndia: boolean;
  offersRelocation: boolean;
  isIndiaEligible: boolean;
  priorityScore: number;
}

export interface JobLocationClassification {
  isIndiaBased: boolean;
  offersRemoteIndia: boolean;
  offersRelocation: boolean;
  isIndiaEligible: boolean;
  cleanLocation: string;
}

// -----------------------------------------------------------------------------
// 1. Engineering / Tech Role Filtering
// -----------------------------------------------------------------------------

const ENGINEERING_POSITIVE_PATTERNS = [
  /\b(software|sde|swe|developer|engineer|engineering)\b/i,
  /\b(frontend|front-end|backend|back-end|fullstack|full-stack)\b/i,
  /\b(web\s*developer|mobile\s*developer|ios|android)\b/i,
  /\b(devops|devsecops|sre|site\s*reliability|platform\s*engineer|infrastructure|cloud\s*engineer)\b/i,
  /\b(data\s*engineer|data\s*platform|machine\s*learning|ml\s*engineer|ai\s*engineer|nlp|computer\s*vision)\b/i,
  /\b(qa\s*engineer|test\s*engineer|quality\s*assurance|sdit|sdet|automation\s*engineer)\b/i,
  /\b(systems\s*engineer|embedded|firmware|distributed\s*systems|kernel)\b/i,
  /\b(security\s*engineer|application\s*security|infosec\s*engineer)\b/i,
  /\b(architect|solutions\s*architect|technical\s*lead|tech\s*lead)\b/i,
  /\b(react|node|next\.?js|python|java|golang|rust|typescript|javascript|c\+\+|c#|\.net)\b/i,
];

const NON_ENGINEERING_EXCLUDE_PATTERNS = [
  /\b(sales\s*representative|sales\s*manager|sales\s*director|account\s*executive|bdr|sdr|business\s*development)\b/i,
  /\b(customer\s*support|customer\s*service|customer\s*success|technical\s*support\s*specialist)\b/i,
  /\b(recruiter|recruitment|talent\s*acquisition|human\s*resources|hr\s*generalist|hr\s*business\s*partner|people\s*operations)\b/i,
  /\b(marketing\s*manager|content\s*writer|copywriter|seo\s*specialist|social\s*media|growth\s*marketer)\b/i,
  /\b(legal|counsel|paralegal|compliance\s*officer|contracts\s*manager)\b/i,
  /\b(office\s*manager|facilities|receptionist|executive\s*assistant|administrative\s*assistant)\b/i,
  /\b(accountant|accounting|finance\s*manager|financial\s*analyst|billing\s*specialist|payroll)\b/i,
  /\b(product\s*designer|graphic\s*designer|ux\/ui\s*designer|brand\s*designer)\b/i,
  /\b(sales\s*engineer|presales|pre-sales)\b/i,
];

export function isEngineeringRole(title: string): boolean {
  if (!title || typeof title !== "string") return false;
  const clean = title.trim();

  // First check explicit negative non-engineering role patterns
  for (const pattern of NON_ENGINEERING_EXCLUDE_PATTERNS) {
    if (pattern.test(clean)) {
      return false;
    }
  }

  // Then check positive engineering role patterns
  for (const pattern of ENGINEERING_POSITIVE_PATTERNS) {
    if (pattern.test(clean)) {
      return true;
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// 2. Strict India-Priority Location & Eligibility Classification
// -----------------------------------------------------------------------------

const INDIA_CITIES_REGEX = /\b(india|bengaluru|bangalore|pune|hyderabad|mumbai|gurugram|gurgaon|noida|delhi|new\s*delhi|chennai|kolkata|ahmedabad|jaipur|kochi|indore|chandigarh|coimbatore)\b/i;

const REMOTE_INDIA_REGEX = /\b(remote\s*[-–—:]*\s*india|india\s*[-–—:]*\s*remote|worldwide|global\s*remote|work\s*from\s*anywhere|anywhere|remote\s*[-–—:]*\s*worldwide|remote\s*\(worldwide\)|apac\s*remote|remote\s*[-–—:]*\s*apac|remote\s*\(apac\)|anywhere\s*in\s*the\s*world)\b/i;

const RELOCATION_REGEX = /\b(visa\s*sponsorship|relocation|visa\s*sponsored|relocation\s*assistance|relocate|offers\s*relocation)\b/i;

// Patterns that restrict the role to non-Indian geographic regions
const RESTRICTED_NON_INDIA_REGEX = /\b(us\s*only|usa\s*only|united\s*states\s*only|remote\s*[-–—:]*\s*us\b|remote\s*[-–—:]*\s*usa\b|remote\s*\(us\)|remote\s*\(usa\)|remote\s*[-–—:]*\s*north\s*america|north\s*america\s*only|eu\s*only|europe\s*only|remote\s*[-–—:]*\s*eu\b|remote\s*[-–—:]*\s*europe|uk\s*only|united\s*kingdom\s*only|remote\s*[-–—:]*\s*uk\b|canada\s*only|remote\s*[-–—:]*\s*canada|australia\s*only|latam\s*only|remote\s*[-–—:]*\s*latam)\b/i;

export function classifyJobLocation(
  locationInput: string | null | undefined,
  title?: string,
  companyRelocationDefault = false
): JobLocationClassification {
  const loc = (locationInput || "").trim();
  const textToScan = `${loc} ${title || ""}`.toLowerCase();

  const isExplicitlyNonIndia = RESTRICTED_NON_INDIA_REGEX.test(loc);
  const mentionsRelocation = RELOCATION_REGEX.test(textToScan) || companyRelocationDefault;
  const isIndiaBased = INDIA_CITIES_REGEX.test(loc);
  const offersRemoteIndia = REMOTE_INDIA_REGEX.test(loc) || (isIndiaBased && /\bremote\b/i.test(loc));
  const offersRelocation = mentionsRelocation && !isIndiaBased;

  // Strict Drop Rule: If restricted to non-India country (e.g. US Only) and has NO relocation/visa sponsorship, drop it!
  if (isExplicitlyNonIndia && !mentionsRelocation) {
    return {
      isIndiaBased: false,
      offersRemoteIndia: false,
      offersRelocation: false,
      isIndiaEligible: false,
      cleanLocation: loc || "Unspecified",
    };
  }

  const isIndiaEligible = isIndiaBased || offersRemoteIndia || offersRelocation;

  // Format clean location display
  let cleanLocation = loc;
  if (isIndiaBased) {
    cleanLocation = loc.toLowerCase().includes("india") ? loc : `${loc}, India`;
  } else if (offersRemoteIndia) {
    cleanLocation = /\bremote\b/i.test(loc) ? loc : `Remote (${loc || "Worldwide"})`;
  } else if (offersRelocation) {
    cleanLocation = `${loc || "International"} (Relocation / Visa)`;
  }

  return {
    isIndiaBased,
    offersRemoteIndia,
    offersRelocation,
    isIndiaEligible,
    cleanLocation: cleanLocation || "India-Eligible",
  };
}

// -----------------------------------------------------------------------------
// 3. India-First Priority Scoring & Sorting
// -----------------------------------------------------------------------------

/**
 * Computes an India-priority score:
 * - Priority 1 (300+): Active physical India engineering hub (Bengaluru, Pune, Hyderabad, etc.)
 * - Priority 2 (200+): Remote roles open to India candidates (Worldwide, Remote India, APAC)
 * - Priority 3 (100+): International roles with explicit Visa / Relocation sponsorship
 * - Non-eligible: 0
 * Fractional bonus based on posted timestamp (newer = higher).
 */
export function scoreLiveJobPriority(job: {
  isIndiaBased?: boolean | null;
  offersRemoteIndia?: boolean | null;
  offersRelocation?: boolean | null;
  postedAt?: Date | string | null;
}): number {
  let baseScore = 0;

  if (job.isIndiaBased) {
    baseScore = 300;
  } else if (job.offersRemoteIndia) {
    baseScore = 200;
  } else if (job.offersRelocation) {
    baseScore = 100;
  } else {
    return 0; // Not India-eligible
  }

  // Add recency bonus (normalized up to 50 points based on timestamp within last 30 days)
  if (job.postedAt) {
    const postTime = typeof job.postedAt === "string" ? new Date(job.postedAt).getTime() : job.postedAt.getTime();
    if (!Number.isNaN(postTime)) {
      const ageHours = Math.max(0, (Date.now() - postTime) / (1000 * 60 * 60));
      const recencyBonus = Math.max(0, 50 - Math.min(50, ageHours / 14.4)); // 30 days = 720h -> 720/14.4 = 50
      baseScore += recencyBonus;
    }
  }

  return Math.round(baseScore * 100) / 100;
}

export function compareLiveJobsPriority(
  a: { isIndiaBased?: boolean | null; offersRemoteIndia?: boolean | null; offersRelocation?: boolean | null; postedAt?: Date | string | null },
  b: { isIndiaBased?: boolean | null; offersRemoteIndia?: boolean | null; offersRelocation?: boolean | null; postedAt?: Date | string | null }
): number {
  const scoreA = scoreLiveJobPriority(a);
  const scoreB = scoreLiveJobPriority(b);
  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }

  const timeA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
  const timeB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
  return timeB - timeA;
}

// -----------------------------------------------------------------------------
// 4. Relative Time Display Helper
// -----------------------------------------------------------------------------

export function formatRelativeJobTime(postedAt?: Date | string | null, now = new Date()): string {
  if (!postedAt) return "Live";
  const date = typeof postedAt === "string" ? new Date(postedAt) : postedAt;
  if (Number.isNaN(date.getTime())) return "Live";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Just now";

  const diffMins = Math.floor(diffMs / (60 * 1000));
  if (diffMins < 60) {
    return diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}
