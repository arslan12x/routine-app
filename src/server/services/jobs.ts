import type { Prisma } from "@/generated/prisma/client";
import { withUserDb, systemDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import {
  calculateNextStageTransition,
  FOLLOWUP_DAY_OFFSETS,
  shouldPromoteFollowUp,
  type ApplicationStage,
  type CompanyCategory,
} from "@/lib/domain/jobs";
import { generateJobEmailDraft, type EmailDraft } from "@/server/ai/jobs";
import { dispatchJobEmail } from "@/server/services/email-dispatcher";
import { CURATED_COMPANIES, ensureCompanyDirectorySeeded, rotateAllHiringCompanies } from "@/server/services/job-scraper";
import { COMPANY_CATEGORIES } from "@/lib/domain/jobs";

const COMMON_SKILLS_LIST = [
  "TypeScript", "JavaScript", "Python", "Java", "Go", "Rust", "C++", "C#", "PHP", "Ruby",
  "React", "Next.js", "Vue", "Angular", "Node.js", "Express", "Fastify", "NestJS", "Spring Boot", "Django",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "DynamoDB", "GraphQL", "REST API", "Prisma",
  "Docker", "Kubernetes", "AWS", "Google Cloud", "Azure", "Terraform", "CI/CD", "Linux", "Microservices",
  "Tailwind CSS", "Redux", "Zustand", "Kafka", "RabbitMQ", "WebSockets", "Playwright", "Vitest", "Jest",
];

export function extractSkillsFromText(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const skill of COMMON_SKILLS_LIST) {
    const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(lower)) {
      found.push(skill);
    }
  }

  return found.length > 0 ? found : ["TypeScript", "Full-Stack Development", "React", "Node.js"];
}

export async function saveUserResume(
  userId: string,
  input: { fileUrl?: string; rawText: string; skills?: string[] }
) {
  const parsedText = input.rawText.trim();
  if (!parsedText) {
    throw new ApiError(400, "VALIDATION", "Resume text or document content is required");
  }

  const skills = input.skills && input.skills.length > 0 ? input.skills : extractSkillsFromText(parsedText);
  const fileUrl = input.fileUrl?.trim() || "/uploads/resumes/default-resume.pdf";

  return withUserDb(userId, (tx) =>
    tx.userResume.upsert({
      where: { userId },
      create: {
        userId,
        fileUrl,
        parsedText,
        skillsJson: skills,
      },
      update: {
        fileUrl,
        parsedText,
        skillsJson: skills,
      },
    })
  );
}

export async function getUserResume(userId: string) {
  return withUserDb(userId, (tx) => tx.userResume.findUnique({ where: { userId } }));
}

export async function queueApplications(
  userId: string,
  categories: CompanyCategory[],
  limit = 5
) {
  await ensureCompanyDirectorySeeded();

  return withUserDb(userId, async (tx) => {
    // Find already queued company IDs
    const existingApps = await tx.jobApplication.findMany({
      where: { userId },
      select: { companyId: true, jobTitle: true },
    });
    const appliedSet = new Set(existingApps.map((a) => `${a.companyId}|${a.jobTitle}`));

    // Find available companies in the selected categories
    const availableCompanies = await tx.company.findMany({
      where: {
        category: { in: categories.length > 0 ? categories : undefined },
      },
      orderBy: { lastRefreshedAt: "desc" },
    });

    const newApplicationsData: Array<{
      userId: string;
      companyId: string;
      jobTitle: string;
      jobUrl: string | null;
      hrEmail: string;
      stage: string;
    }> = [];

    for (const company of availableCompanies) {
      if (newApplicationsData.length >= limit) break;

      const seed = CURATED_COMPANIES.find((c) => c.name === company.name);
      const role = seed?.sampleRoles?.[0] || "Full-Stack Software Engineer";

      if (!appliedSet.has(`${company.id}|${role}`)) {
        newApplicationsData.push({
          userId,
          companyId: company.id,
          jobTitle: role,
          jobUrl: company.websiteUrl,
          hrEmail: company.hrEmail,
          stage: "TO_APPLY",
        });
        appliedSet.add(`${company.id}|${role}`);
      }
    }

    if (newApplicationsData.length > 0) {
      await tx.jobApplication.createMany({
        data: newApplicationsData,
        skipDuplicates: true,
      });
    }

    return tx.jobApplication.findMany({
      where: { userId, stage: "TO_APPLY" },
      include: { company: true },
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function backfillApplications(userId: string, categories?: CompanyCategory[]) {
  const currentToApply = await withUserDb(userId, (tx) =>
    tx.jobApplication.count({
      where: { userId, stage: "TO_APPLY" },
    })
  );

  const needed = Math.max(0, 5 - currentToApply);
  if (needed > 0) {
    const cats = categories && categories.length > 0 ? categories : (["STARTUP", "BIG_MNC", "BIG_SHARKS", "ACTIVELY_HIRING"] as CompanyCategory[]);
    await queueApplications(userId, cats, needed);
  }
}

/** Refreshes the 2-day batch across ALL 7 categories and shifts previous applied jobs to Follow-Up 1 */
export async function refreshAndRotateHiringBatch(
  userId: string,
  categories: CompanyCategory[] = [...COMPANY_CATEGORIES]
) {
  // 1. Rotate hiring listings across all 7 categories
  await rotateAllHiringCompanies();

  return withUserDb(userId, async (tx) => {
    // 2. Advance previously applied TO_APPLY companies to FOLLOW_UP_1 (Day 4 window)
    const now = new Date();
    const appliedInToApply = await tx.jobApplication.findMany({
      where: {
        userId,
        stage: "TO_APPLY",
        appliedAt: { not: null },
      },
    });

    for (const app of appliedInToApply) {
      const appliedAt = app.appliedAt || now;
      const nextActionAt = new Date(appliedAt.getTime() + 4 * 24 * 60 * 60 * 1000);
      const existingLogs = (app.logs as Array<Record<string, unknown>>) || [];
      await tx.jobApplication.update({
        where: { id: app.id },
        data: {
          stage: "FOLLOW_UP_1",
          nextActionAt,
          logs: [
            ...existingLogs,
            {
              action: "SHIFTED_TO_FOLLOW_UP_1",
              stage: "FOLLOW_UP_1",
              timestamp: now.toISOString(),
              note: "2-Day hiring batch refresh advanced application to Follow-Up 1 stage.",
            },
          ] as Prisma.InputJsonValue,
        },
      });
    }

    // 3. Queue fresh currently hiring opportunities into TO_APPLY
    return queueApplications(userId, categories, 6);
  });
}

export async function listUserApplications(
  userId: string,
  filters?: { stage?: string; categories?: CompanyCategory[] }
) {
  return withUserDb(userId, async (tx) => {
    // 1. Check and promote buffer states
    const now = new Date();
    const waitingApps = await tx.jobApplication.findMany({
      where: {
        userId,
        stage: { in: ["WAITING_FU1", "WAITING_FU2", "WAITING_FU3"] },
        nextActionAt: { lte: now },
      },
    });

    for (const app of waitingApps) {
      const promotedStage = shouldPromoteFollowUp(app.stage as ApplicationStage, app.nextActionAt, now);
      if (promotedStage) {
        await tx.jobApplication.update({
          where: { id: app.id },
          data: { stage: promotedStage },
        });
      }
    }

    // 2. Fetch all user applications
    const allApps = await tx.jobApplication.findMany({
      where: {
        userId,
        stage: filters?.stage ? filters.stage : undefined,
        company: filters?.categories && filters.categories.length > 0 ? { category: { in: filters.categories } } : undefined,
      },
      include: {
        company: true,
      },
      orderBy: [{ stage: "asc" }, { nextActionAt: "asc" }, { createdAt: "desc" }],
    });

    // 3. Compute badge counts
    const toApplyCount = allApps.filter((a) => a.stage === "TO_APPLY").length;
    const fu1Count = allApps.filter((a) => a.stage === "FOLLOW_UP_1" || (a.stage === "WAITING_FU1" && a.nextActionAt && a.nextActionAt <= now)).length;
    const fu2Count = allApps.filter((a) => a.stage === "FOLLOW_UP_2" || (a.stage === "WAITING_FU2" && a.nextActionAt && a.nextActionAt <= now)).length;
    const fu3Count = allApps.filter((a) => a.stage === "FOLLOW_UP_3" || (a.stage === "WAITING_FU3" && a.nextActionAt && a.nextActionAt <= now)).length;
    const repliedCount = allApps.filter((a) => a.stage === "REPLIED").length;
    const closedCount = allApps.filter((a) => a.stage === "CLOSED").length;

    return {
      applications: allApps,
      counts: {
        toApply: toApplyCount,
        followUp1: fu1Count,
        followUp2: fu2Count,
        followUp3: fu3Count,
        replied: repliedCount,
        closed: closedCount,
      },
    };
  });
}

export async function getJobEmailDraftForApp(
  user: AppUser,
  applicationId: string
): Promise<EmailDraft> {
  const application = await withUserDb(user.id, (tx) =>
    tx.jobApplication.findUnique({
      where: { id: applicationId },
      include: { company: true },
    })
  );

  if (!application || application.userId !== user.id) {
    throw new ApiError(404, "NOT_FOUND", "Application not found");
  }

  const resume = await getUserResume(user.id);
  const candidateName = user.displayName || user.name || "Software Engineer";

  let stageKey: "APPLY" | "FOLLOW_UP_1" | "FOLLOW_UP_2" | "FOLLOW_UP_3" = "APPLY";
  if (application.stage === "FOLLOW_UP_1" || application.stage === "WAITING_FU1") {
    stageKey = "FOLLOW_UP_1";
  } else if (application.stage === "FOLLOW_UP_2" || application.stage === "WAITING_FU2") {
    stageKey = "FOLLOW_UP_2";
  } else if (application.stage === "FOLLOW_UP_3" || application.stage === "WAITING_FU3") {
    stageKey = "FOLLOW_UP_3";
  }

  const skills = (resume?.skillsJson as string[]) || [];

  return generateJobEmailDraft({
    stage: stageKey,
    candidateName,
    jobTitle: application.jobTitle,
    companyName: application.company.name,
    hrEmail: application.hrEmail,
    parsedResume: resume?.parsedText,
    skills,
  });
}

export async function applyToJob(
  user: AppUser,
  applicationId: string,
  customSubject?: string,
  customBody?: string
) {
  const application = await withUserDb(user.id, (tx) =>
    tx.jobApplication.findUnique({
      where: { id: applicationId },
      include: { company: true },
    })
  );

  if (!application || application.userId !== user.id) {
    throw new ApiError(404, "NOT_FOUND", "Application not found");
  }

  // Generate email if not provided
  const emailDraft = customSubject && customBody
    ? { subject: customSubject, body: customBody, stage: "APPLY" }
    : await getJobEmailDraftForApp(user, applicationId);

  // Dispatch email
  const dispatchResult = await dispatchJobEmail({
    to: application.hrEmail,
    subject: emailDraft.subject,
    body: emailDraft.body,
  });

  const now = new Date();
  const transition = calculateNextStageTransition("TO_APPLY", now);

  const existingLogs = (application.logs as Array<Record<string, unknown>>) || [];
  const updatedLogs = [
    ...existingLogs,
    {
      action: "APPLY_SENT",
      stage: "APPLY",
      subject: emailDraft.subject,
      body: emailDraft.body,
      dispatchedAt: dispatchResult.dispatchedAt,
      messageId: dispatchResult.messageId,
      provider: dispatchResult.provider,
    },
  ];

  const updated = await withUserDb(user.id, (tx) =>
    tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        stage: transition.nextStage,
        appliedAt: now,
        nextActionAt: transition.nextActionAt,
        emailThreadId: dispatchResult.messageId,
        logs: updatedLogs as Prisma.InputJsonValue,
      },
      include: { company: true },
    })
  );

  // Immediately backfill fresh jobs into TO_APPLY
  await backfillApplications(user.id).catch((err) =>
    console.warn("[Job Engine] Backfill after apply notice", err)
  );

  return updated;
}

export async function sendJobFollowUp(
  user: AppUser,
  applicationId: string,
  targetStage: "FOLLOW_UP_1" | "FOLLOW_UP_2" | "FOLLOW_UP_3",
  customSubject?: string,
  customBody?: string
) {
  const application = await withUserDb(user.id, (tx) =>
    tx.jobApplication.findUnique({
      where: { id: applicationId },
      include: { company: true },
    })
  );

  if (!application || application.userId !== user.id) {
    throw new ApiError(404, "NOT_FOUND", "Application not found");
  }

  if (!application.appliedAt) {
    throw new ApiError(400, "NOT_APPLIED", "Application must be in applied state first");
  }

  // Generate or use custom email
  const emailDraft = customSubject && customBody
    ? { subject: customSubject, body: customBody, stage: targetStage }
    : await getJobEmailDraftForApp(user, applicationId);

  const dispatchResult = await dispatchJobEmail({
    to: application.hrEmail,
    subject: emailDraft.subject,
    body: emailDraft.body,
    threadId: application.emailThreadId,
  });

  const transition = calculateNextStageTransition(targetStage, application.appliedAt);

  const existingLogs = (application.logs as Array<Record<string, unknown>>) || [];
  const updatedLogs = [
    ...existingLogs,
    {
      action: `${targetStage}_SENT`,
      stage: targetStage,
      subject: emailDraft.subject,
      body: emailDraft.body,
      dispatchedAt: dispatchResult.dispatchedAt,
      messageId: dispatchResult.messageId,
      provider: dispatchResult.provider,
    },
  ];

  return withUserDb(user.id, (tx) =>
    tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        stage: transition.nextStage,
        nextActionAt: transition.nextActionAt,
        logs: updatedLogs as Prisma.InputJsonValue,
      },
      include: { company: true },
    })
  );
}

export async function logHrReply(userId: string, applicationId: string, replyNote?: string) {
  const application = await withUserDb(userId, (tx) =>
    tx.jobApplication.findUnique({
      where: { id: applicationId },
    })
  );

  if (!application || application.userId !== userId) {
    throw new ApiError(404, "NOT_FOUND", "Application not found");
  }

  const existingLogs = (application.logs as Array<Record<string, unknown>>) || [];
  const updatedLogs = [
    ...existingLogs,
    {
      action: "HR_REPLIED",
      timestamp: new Date().toISOString(),
      note: replyNote?.trim() || "HR response received. Sequence paused.",
    },
  ];

  return withUserDb(userId, (tx) =>
    tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        stage: "REPLIED",
        nextActionAt: null, // Cancel all future follow-ups
        logs: updatedLogs as Prisma.InputJsonValue,
      },
      include: { company: true },
    })
  );
}

export async function toggleAutoSend(userId: string, applicationId: string, autoSend: boolean) {
  return withUserDb(userId, (tx) =>
    tx.jobApplication.update({
      where: { id: applicationId },
      data: { autoSend },
      include: { company: true },
    })
  );
}

/** Inngest Pipeline Advancement Worker: Evaluates promotions and auto-dispatches follow-ups */
export async function advanceJobPipeline(): Promise<{ promotedCount: number; autoSentCount: number }> {
  const now = new Date();
  let promoted = 0;
  let autoSent = 0;

  const dueApps = await systemDb.jobApplication.findMany({
    where: {
      stage: { in: ["WAITING_FU1", "WAITING_FU2", "WAITING_FU3"] },
      nextActionAt: { lte: now },
    },
    include: {
      user: {
        select: { id: true, name: true, settings: { select: { displayName: true } } },
      },
      company: true,
    },
  });

  for (const app of dueApps) {
    const promotedStage = shouldPromoteFollowUp(app.stage as ApplicationStage, app.nextActionAt, now);
    if (!promotedStage) continue;

    await systemDb.jobApplication.update({
      where: { id: app.id },
      data: { stage: promotedStage },
    });
    promoted++;

    // If autoSend is enabled, automatically dispatch the follow-up!
    if (app.autoSend && app.appliedAt) {
      try {
        const candidateName = app.user?.settings?.displayName || app.user?.name || "Software Engineer";
        const resume = await systemDb.userResume.findUnique({ where: { userId: app.userId } });
        const skills = (resume?.skillsJson as string[]) || [];

        const draft = await generateJobEmailDraft({
          stage: promotedStage as "FOLLOW_UP_1" | "FOLLOW_UP_2" | "FOLLOW_UP_3",
          candidateName,
          jobTitle: app.jobTitle,
          companyName: app.company.name,
          hrEmail: app.hrEmail,
          parsedResume: resume?.parsedText,
          skills,
        });

        const dispatchResult = await dispatchJobEmail({
          to: app.hrEmail,
          subject: draft.subject,
          body: draft.body,
          threadId: app.emailThreadId,
        });

        const nextTransition = calculateNextStageTransition(promotedStage, app.appliedAt);
        const existingLogs = (app.logs as Array<Record<string, unknown>>) || [];
        const updatedLogs = [
          ...existingLogs,
          {
            action: `AUTO_${promotedStage}_SENT`,
            stage: promotedStage,
            subject: draft.subject,
            body: draft.body,
            dispatchedAt: dispatchResult.dispatchedAt,
            messageId: dispatchResult.messageId,
          },
        ];

        await systemDb.jobApplication.update({
          where: { id: app.id },
          data: {
            stage: nextTransition.nextStage,
            nextActionAt: nextTransition.nextActionAt,
            logs: updatedLogs as Prisma.InputJsonValue,
          },
        });

        autoSent++;
      } catch (err) {
        console.warn(`[Job Engine] Auto-send failed for app ${app.id}`, err);
      }
    }
  }

  return { promotedCount: promoted, autoSentCount: autoSent };
}
