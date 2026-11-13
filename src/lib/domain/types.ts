export type DateStr = string; // "YYYY-MM-DD" local calendar date
export type Category = "FITNESS" | "LEARNING" | "HEALTH" | "PERSONAL_DEVELOPMENT" | "OTHER";
export type CompletionType = "BOOLEAN" | "MEASURABLE";
export type Recurrence = "DAILY" | "WEEKDAYS" | "WEEKLY_TOTAL";
export type StudySubject = "DSA" | "FDA" | "JAVA" | "SYSTEM_DESIGN";

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
  isAiGated: boolean;
  aiSubject: StudySubject | null;
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
