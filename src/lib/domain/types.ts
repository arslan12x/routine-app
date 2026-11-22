export type DateStr = string; // "YYYY-MM-DD" local calendar date
export type Category = "FITNESS" | "LEARNING" | "HEALTH" | "PERSONAL_DEVELOPMENT" | "OTHER";
export type PersonalDevType = "JOB_APPLY" | "DUOLINGO" | "NOVEL_READING" | "BLOG_WRITING" | "CUSTOM";
export type CompletionType = "BOOLEAN" | "MEASURABLE";
export type Recurrence = "DAILY" | "WEEKDAYS" | "WEEKLY_TOTAL";
export type StudySubject = "DSA" | "FDA" | "JAVA" | "SYSTEM_DESIGN" | "CUSTOM";

export interface TaskVersion {
  effectiveFrom: DateStr;
  isMandatory: boolean;
  completionType: CompletionType;
  target: number;
  unit: string | null;
  recurrence: Recurrence;
  weekdays: number[]; // ISO 1 (Mon) - 7 (Sun)
}

export interface TaskDef {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  personalDevType?: PersonalDevType | null;
  isAiGated: boolean;
  aiSubject: StudySubject | null;
  aiCourseName: string | null;
  aiCoursePrompt: string | null;
  sortOrder: number;
  startDate: DateStr;
  archivedOn: DateStr | null;
  versions: TaskVersion[]; // sorted ascending by effectiveFrom
}

export type LogMap = Map<string, number>;
export type DayStatus = "FUTURE" | "NEUTRAL" | "SUCCESS" | "PENDING" | "FAILED";

export interface DayInfo {
  date: DateStr;
  status: DayStatus;
  mandatoryTotal: number;
  mandatoryDone: number;
  total: number; // daily-schedulable tasks (excludes weekly-total)
  done: number;
}

export interface EnabledPersonalDevModules {
  jobs: boolean;
  duolingo: boolean;
  novels: boolean;
  blogs: boolean;
}

export function inferPersonalDevType(
  title: string,
  description?: string | null,
  category?: string
): PersonalDevType | null {
  const text = `${title || ""} ${description || ""}`.toLowerCase();

  // Novel reading patterns: novel, book, chapters, read ... pages, reading ... pages
  if (
    /\b(?:novel|novels|book|books|chapter|chapters|page|pages|read\s+\d+|reading\s*\d+|read\s+novel|reading\s+novel|reading\s+book)\b/i.test(text)
  ) {
    return "NOVEL_READING";
  }

  // Duolingo patterns
  if (/\b(?:duolingo|language\s+lesson|vocab\s+practice)\b/i.test(text)) {
    return "DUOLINGO";
  }

  // Job apply patterns
  if (/\b(?:job|jobs|apply|applying|job\s+hunt|interview|sde\s+application|pitch\s+hr|recruiter|recruiters|recruiting|outreach|pitch|cold\s+email)\b/i.test(text)) {
    return "JOB_APPLY";
  }

  // Blog writing patterns
  if (/\b(?:blog|blogs|blogging|article|substack|write\s+post)\b/i.test(text)) {
    return "BLOG_WRITING";
  }

  if (category === "PERSONAL_DEVELOPMENT") {
    return "CUSTOM";
  }

  return null;
}

export function computeEnabledModules(
  tasks: Array<{
    title?: string;
    description?: string | null;
    category?: string;
    personalDevType?: string | null;
    archivedOn?: unknown | null;
  }>
): EnabledPersonalDevModules {
  const active = tasks.filter((t) => !t.archivedOn);
  const types = new Set(
    active
      .map((t) => t.personalDevType || inferPersonalDevType(t.title || "", t.description, t.category))
      .filter(Boolean)
  );
  return {
    jobs: types.has("JOB_APPLY"),
    duolingo: types.has("DUOLINGO"),
    novels: types.has("NOVEL_READING"),
    blogs: types.has("BLOG_WRITING"),
  };
}
