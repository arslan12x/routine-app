import { z } from "zod";
import { isValidDate, isValidTimezone } from "@/lib/domain/dates";

export const dateStr = z.string().refine(isValidDate, "Use YYYY-MM-DD");
export const categoryEnum = z.enum(["FITNESS", "LEARNING", "HEALTH", "PERSONAL_DEVELOPMENT", "OTHER"]);
export const completionEnum = z.enum(["BOOLEAN", "MEASURABLE"]);
export const recurrenceEnum = z.enum(["DAILY", "WEEKDAYS", "WEEKLY_TOTAL"]);
export const studySubjectEnum = z.enum(["DSA", "FDA", "JAVA", "SYSTEM_DESIGN", "CUSTOM"]);
const weekdays = z.array(z.number().int().min(1).max(7)).max(7);

export const taskCreate = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(80),
    description: z.string().trim().max(300).nullable().optional(),
    category: categoryEnum.default("OTHER"),
    isMandatory: z.boolean().default(false),
    completionType: completionEnum.default("BOOLEAN"),
    target: z.number().positive().max(10_000_000).default(1),
    unit: z.string().trim().max(20).nullable().optional(),
    recurrence: recurrenceEnum.default("DAILY"),
    weekdays: weekdays.default([]),
    startDate: dateStr.optional(),
    isAiGated: z.boolean().default(false),
    aiSubject: studySubjectEnum.nullable().optional(),
    aiCourseName: z.string().trim().min(1).max(80).nullable().optional(),
    aiCoursePrompt: z.string().trim().min(1).max(4_000).nullable().optional(),
  })
  .refine((v) => !(v.recurrence === "WEEKLY_TOTAL" && v.isMandatory), { message: "Weekly-total tasks cannot be mandatory", path: ["isMandatory"] })
  .refine((v) => v.recurrence !== "WEEKDAYS" || v.weekdays.length > 0, { message: "Pick at least one weekday", path: ["weekdays"] })
  .refine(
    (v) => !v.isAiGated || v.aiSubject !== "CUSTOM" || (!!v.aiCourseName?.trim() && !!v.aiCoursePrompt?.trim()),
    { message: "Enter a course name and learning prompt for a custom study course", path: ["aiCoursePrompt"] },
  )
  .refine(
    (v) => v.aiSubject === "CUSTOM" || (v.aiCourseName == null && v.aiCoursePrompt == null),
    { message: "Custom course details are only valid for a custom AI-guided course", path: ["aiCourseName"] },
  );

export const taskPatch = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  category: categoryEnum.optional(),
  isMandatory: z.boolean().optional(),
  completionType: completionEnum.optional(),
  target: z.number().positive().max(10_000_000).optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  recurrence: recurrenceEnum.optional(),
  weekdays: weekdays.optional(),
  isAiGated: z.boolean().optional(),
  aiSubject: studySubjectEnum.nullable().optional(),
  aiCourseName: z.string().trim().min(1).max(80).nullable().optional(),
  aiCoursePrompt: z.string().trim().min(1).max(4_000).nullable().optional(),
  archived: z.literal(true).optional(), // archiving is one-way (un-archiving would retroactively fail the gap)
});

export const progressBody = z.object({ date: dateStr, value: z.number().min(0).max(10_000_000) });
export const dateQuery = z.object({ date: dateStr.optional() });
export const monthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

export const settingsPatch = z.object({
  timezone: z.string().refine(isValidTimezone, "Unknown timezone").optional(),
  weekStartsOn: z.union([z.literal(1), z.literal(7)]).optional(),
  displayName: z.string().trim().min(1).max(30).nullable().optional(),
  showOnLeaderboard: z.boolean().optional(),
});

export const insightsQuery = z.object({
  range: z.enum(["day", "week", "month", "custom"]).default("week"),
  from: dateStr.optional(),
  to: dateStr.optional(),
  group: z.enum(["day", "week", "month"]).optional(),
});

export const accountCreateBody = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/, "Use letters, numbers, underscores, or periods"),
  email: z.string().trim().email("Use a valid email address").max(255),
  password: z.string().min(8).max(128),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});

export const friendRequestBody = z.object({
  userId: z.string().trim().min(1).max(128),
});
export const friendRequestActionBody = z.object({
  action: z.enum(["accept", "decline"]),
});

export type TaskCreate = z.infer<typeof taskCreate>;
export type TaskPatch = z.infer<typeof taskPatch>;
