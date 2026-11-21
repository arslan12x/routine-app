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
  type CandidateExperienceLevel,
  CANDIDATE_EXPERIENCE_LEVELS,
  inferExperienceLevelFromTitle,
  matchesLocationFilter,
  type LocationEligibilityFilter,
} from "@/lib/domain/jobs";
import { generateJobEmailDraft, type EmailDraft } from "@/server/ai/jobs";
import { sendDirectEmail } from "@/server/services/email-transport";
import { fetchAllActiveLiveJobs } from "@/server/services/live-job-fetchers";
import { scoreLiveJobPriority, type NormalizedLiveJob } from "@/lib/domain/live-jobs";
import {
  CURATED_COMPANIES,
  ensureCompanyDirectorySeeded,
  rotateAllHiringCompanies,
  getRoleForExperience,
} from "@/server/services/job-scraper";
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
  input: {
    fileUrl?: string;
    rawText: string;
    skills?: string[];
    fileData?: string;
    mimeType?: string;
  }
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
        fileData: input.fileData,
        mimeType: input.mimeType,
        skillsJson: skills,
      },
      update: {
        fileUrl,
        parsedText,
        fileData: input.fileData !== undefined ? input.fileData : undefined,
        mimeType: input.mimeType !== undefined ? input.mimeType : undefined,
        skillsJson: skills,
      },
    })
  );
}

export async function getUserResume(userId: string) {
  return withUserDb(userId, (tx) => tx.userResume.findUnique({ where: { userId } }));
}

export interface CandidateProfile {
  email: string;
  isCustom: boolean;
  experienceLevel: CandidateExperienceLevel;
  experienceYears: number;
}

export async function getCandidateProfile(userId: string): Promise<CandidateProfile> {
  const integration = await withUserDb(userId, (tx) =>
    tx.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "CANDIDATE_JOB_PROFILE",
        },
      },
    })
  );

  const rawMeta = integration?.metadata as Record<string, unknown> | null;
  const experienceLevel: CandidateExperienceLevel =
    typeof rawMeta?.experienceLevel === "string" &&
    CANDIDATE_EXPERIENCE_LEVELS.includes(rawMeta.experienceLevel as CandidateExperienceLevel)
      ? (rawMeta.experienceLevel as CandidateExperienceLevel)
      : "FRESHER";

  const experienceYears: number =
    typeof rawMeta?.experienceYears === "number"
      ? rawMeta.experienceYears
      : experienceLevel === "FRESHER"
      ? 0
      : experienceLevel === "JUNIOR"
      ? 2
      : experienceLevel === "MID"
      ? 4
      : 6;

  if (integration?.externalUsername?.trim()) {
    return {
      email: integration.externalUsername.trim(),
      isCustom: true,
      experienceLevel,
      experienceYears,
    };
  }

  const user = await systemDb.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  return {
    email: user?.email || "",
    isCustom: false,
    experienceLevel,
    experienceYears,
  };
}

export async function saveCandidateProfile(
  userId: string,
  input: {
    email?: string;
    experienceLevel?: CandidateExperienceLevel;
    experienceYears?: number;
  }
): Promise<CandidateProfile> {
  const current = await getCandidateProfile(userId);
  let email = current.email;

  if (input.email !== undefined) {
    const trimmed = input.email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      throw new ApiError(400, "INVALID_EMAIL", "Please provide a valid email address for job applications");
    }
    email = trimmed;
  }

  const experienceLevel = input.experienceLevel || current.experienceLevel;
  const experienceYears =
    input.experienceYears !== undefined
      ? input.experienceYears
      : experienceLevel === "FRESHER"
      ? 0
      : experienceLevel === "JUNIOR"
      ? 2
      : experienceLevel === "MID"
      ? 4
      : 6;

  await withUserDb(userId, (tx) =>
    tx.userIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: "CANDIDATE_JOB_PROFILE",
        },
      },
      create: {
        userId,
        provider: "CANDIDATE_JOB_PROFILE",
        externalUsername: email,
        lastStatus: "VERIFIED",
        metadata: {
          experienceLevel,
          experienceYears,
          updatedAt: new Date().toISOString(),
        },
      },
      update: {
        externalUsername: email,
        lastStatus: "VERIFIED",
        metadata: {
          experienceLevel,
          experienceYears,
          updatedAt: new Date().toISOString(),
        },
      },
    })
  );

  return {
    email,
    isCustom: true,
    experienceLevel,
    experienceYears,
  };
}

export async function saveCandidateEmail(userId: string, email: string): Promise<string> {
  const profile = await saveCandidateProfile(userId, { email });
  return profile.email;
}

export async function syncLiveJobsForCandidate(
  userId: string,
  liveJobs: NormalizedLiveJob[],
  options?: {
    categories?: CompanyCategory[];
    limit?: number;
    experienceLevel?: CandidateExperienceLevel;
    locationFilter?: LocationEligibilityFilter;
  }
) {
  const limit = options?.limit ?? 30;
  const categories = options?.categories;
  const locationFilter = options?.locationFilter ?? "ALL_INDIA_ELIGIBLE";

  return withUserDb(userId, async (tx) => {
    // 1. Ensure all companies referenced in live jobs exist in database
    const companyNames = Array.from(new Set(liveJobs.map((j) => j.companyName)));
    const existingCompanies = await tx.company.findMany({
      where: { name: { in: companyNames } },
    });
    const companyMap = new Map(existingCompanies.map((c) => [c.name.toLowerCase(), c]));

    for (const job of liveJobs) {
      const key = job.companyName.toLowerCase();
      if (!companyMap.has(key)) {
        const created = await tx.company.create({
          data: {
            name: job.companyName,
            category: job.companyCategory,
            hrEmail: job.hrEmail,
            websiteUrl: job.jobUrl,
            location: job.jobLocation,
            hiresFromIndia: true,
            isIndiaBased: job.isIndiaBased,
            offersRemoteIndia: job.offersRemoteIndia,
            offersRelocation: job.offersRelocation,
            atsProvider: job.atsProvider,
          },
        });
        companyMap.set(key, created);
      }
    }

    // 2. Auto-Expire Closed Jobs:
    // If an unapplied TO_APPLY job (isLiveVerified: true, appliedAt: null)
    // is no longer present in the latest live feed for that company, remove it!
    const unappliedApps = await tx.jobApplication.findMany({
      where: {
        userId,
        stage: "TO_APPLY",
        appliedAt: null,
        isLiveVerified: true,
      },
      include: { company: true },
    });

    const liveJobKeySet = new Set(
      liveJobs.map((j) => `${j.companyName.toLowerCase()}|${j.title.toLowerCase()}`)
    );
    const checkedCompanySet = new Set(liveJobs.map((j) => j.companyName.toLowerCase()));

    const toDeleteIds: string[] = [];
    for (const app of unappliedApps) {
      if (checkedCompanySet.has(app.company.name.toLowerCase())) {
        const appKey = `${app.company.name.toLowerCase()}|${app.jobTitle.toLowerCase()}`;
        if (!liveJobKeySet.has(appKey)) {
          toDeleteIds.push(app.id);
        }
      }
    }

    if (toDeleteIds.length > 0) {
      await tx.jobApplication.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
    }

    // 3. User's existing applications (prevent re-queuing already applied/active roles)
    const userExistingApps = await tx.jobApplication.findMany({
      where: { userId },
      select: { companyId: true, jobTitle: true },
    });
    const appliedSet = new Set(userExistingApps.map((a) => `${a.companyId}|${a.jobTitle}`));

    // 4. Filter live jobs by category, locationFilter, and limit
    const newApplicationsData: Array<{
      userId: string;
      companyId: string;
      jobTitle: string;
      jobUrl: string | null;
      jobLocation: string | null;
      externalJobId: string | null;
      postedAt: Date | null;
      isLiveVerified: boolean;
      hrEmail: string;
      stage: string;
    }> = [];

    for (const liveJob of liveJobs) {
      if (newApplicationsData.length >= limit) break;

      // Category check
      if (categories && categories.length > 0 && !categories.includes(liveJob.companyCategory as CompanyCategory)) {
        continue;
      }

      // Location filter check
      if (!matchesLocationFilter(liveJob, locationFilter)) {
        continue;
      }

      const comp = companyMap.get(liveJob.companyName.toLowerCase());
      if (!comp) continue;

      const appKey = `${comp.id}|${liveJob.title}`;
      if (!appliedSet.has(appKey)) {
        newApplicationsData.push({
          userId,
          companyId: comp.id,
          jobTitle: liveJob.title,
          jobUrl: liveJob.jobUrl,
          jobLocation: liveJob.jobLocation,
          externalJobId: liveJob.externalJobId,
          postedAt: liveJob.postedAt ? new Date(liveJob.postedAt) : null,
          isLiveVerified: true,
          hrEmail: liveJob.hrEmail || comp.hrEmail,
          stage: "TO_APPLY",
        });
        appliedSet.add(appKey);
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
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    });
  });
}

export async function queueApplications(
  userId: string,
  categories: CompanyCategory[] = [...COMPANY_CATEGORIES],
  limit = 30,
  experienceLevel?: CandidateExperienceLevel,
  locationFilter: LocationEligibilityFilter = "ALL_INDIA_ELIGIBLE"
) {
  await ensureCompanyDirectorySeeded().catch((err) =>
    console.warn("[Job Engine] ensureCompanyDirectorySeeded notice", err)
  );

  const candidate = await getCandidateProfile(userId);
  const expLevel = experienceLevel || candidate.experienceLevel || "FRESHER";

  // Fetch real-time active jobs
  const liveJobs = await fetchAllActiveLiveJobs({
    categories,
    experienceLevel: expLevel,
  });

  return syncLiveJobsForCandidate(userId, liveJobs, {
    categories,
    limit,
    experienceLevel: expLevel,
    locationFilter,
  });
}

export async function backfillApplications(
  userId: string,
  categories?: CompanyCategory[],
  locationFilter?: LocationEligibilityFilter
) {
  const currentToApply = await withUserDb(userId, (tx) =>
    tx.jobApplication.count({
      where: { userId, stage: "TO_APPLY" },
    })
  );

  const needed = Math.max(0, 30 - currentToApply);
  if (needed > 0) {
    const cats = categories && categories.length > 0 ? categories : [...COMPANY_CATEGORIES];
    await queueApplications(userId, cats, needed, undefined, locationFilter);
  }
}

/** Refreshes the 2-day batch across ALL 7 categories and shifts previous applied jobs to Follow-Up 1 */
export async function refreshAndRotateHiringBatch(
  userId: string,
  categories: CompanyCategory[] = [...COMPANY_CATEGORIES],
  experienceLevel?: CandidateExperienceLevel,
  locationFilter?: LocationEligibilityFilter
) {
  // 1. Rotate hiring listings across all 7 categories (outside transaction)
  await rotateAllHiringCompanies().catch((err) =>
    console.warn("[Job Engine] rotateAllHiringCompanies notice", err)
  );

  await ensureCompanyDirectorySeeded().catch((err) =>
    console.warn("[Job Engine] ensureCompanyDirectorySeeded notice", err)
  );

  // 2. Advance previously applied TO_APPLY companies to FOLLOW_UP_1 (Day 4 window)
  const now = new Date();
  const nextActionAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

  await withUserDb(userId, async (tx) => {
    await tx.jobApplication.updateMany({
      where: {
        userId,
        stage: "TO_APPLY",
        appliedAt: { not: null },
      },
      data: {
        stage: "FOLLOW_UP_1",
        nextActionAt,
      },
    });
  });

  // 3. Queue at least 30 fresh currently hiring opportunities into TO_APPLY tailored to candidate experience and location filter
  return queueApplications(userId, categories, 30, experienceLevel, locationFilter);
}

export async function listUserApplications(
  userId: string,
  filters?: {
    stage?: string;
    categories?: CompanyCategory[];
    experienceLevel?: CandidateExperienceLevel;
    locationFilter?: LocationEligibilityFilter;
  }
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

    // 3. Filter by Location & Eligibility Parent Filter
    const locFilter = filters?.locationFilter || "ALL_INDIA_ELIGIBLE";
    const filteredApps = allApps.filter((a) => matchesLocationFilter(a.company, locFilter));

    // Sort India jobs to the top on priority by default
    filteredApps.sort((a, b) => {
      if (a.stage === b.stage) {
        const scoreA = scoreLiveJobPriority({
          isIndiaBased: a.company.isIndiaBased,
          offersRemoteIndia: a.company.offersRemoteIndia,
          offersRelocation: a.company.offersRelocation,
          postedAt: a.postedAt || a.createdAt,
        });
        const scoreB = scoreLiveJobPriority({
          isIndiaBased: b.company.isIndiaBased,
          offersRemoteIndia: b.company.offersRemoteIndia,
          offersRelocation: b.company.offersRelocation,
          postedAt: b.postedAt || b.createdAt,
        });
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        const timeA = a.postedAt ? new Date(a.postedAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.postedAt ? new Date(b.postedAt).getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      }
      return 0;
    });

    // 4. Compute badge counts from filteredApps
    const toApplyCount = filteredApps.filter((a) => a.stage === "TO_APPLY").length;
    const fu1Count = filteredApps.filter((a) => a.stage === "FOLLOW_UP_1" || (a.stage === "WAITING_FU1" && a.nextActionAt && a.nextActionAt <= now)).length;
    const fu2Count = filteredApps.filter((a) => a.stage === "FOLLOW_UP_2" || (a.stage === "WAITING_FU2" && a.nextActionAt && a.nextActionAt <= now)).length;
    const fu3Count = filteredApps.filter((a) => a.stage === "FOLLOW_UP_3" || (a.stage === "WAITING_FU3" && a.nextActionAt && a.nextActionAt <= now)).length;
    const repliedCount = filteredApps.filter((a) => a.stage === "REPLIED").length;
    const closedCount = filteredApps.filter((a) => a.stage === "CLOSED").length;

    return {
      applications: filteredApps,
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
  const candidate = await getCandidateProfile(user.id);
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
    experienceLevel: candidate.experienceLevel,
    isIndiaBased: application.company.isIndiaBased,
    offersRemoteIndia: application.company.offersRemoteIndia,
    offersRelocation: application.company.offersRelocation,
    companyCategory: application.company.category,
  });
}

export async function applyToJob(
  user: AppUser,
  applicationId: string,
  customSubject?: string,
  customBody?: string
) {
  // 1. Strict Resume Check: Do not allow applying without a resume!
  const resume = await getUserResume(user.id);
  if (!resume || !resume.parsedText?.trim()) {
    throw new ApiError(
      400,
      "RESUME_REQUIRED",
      "You must upload your resume document (.pdf, .doc, .docx, .txt) before applying to jobs."
    );
  }

  // 2. Candidate Contact Email Check: Require email for replies!
  const candidate = await getCandidateProfile(user.id);
  const senderEmail = candidate.email;
  if (!senderEmail) {
    throw new ApiError(
      400,
      "EMAIL_REQUIRED",
      "Please provide your contact email address before applying so hiring teams can respond directly to you."
    );
  }

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

  const resumeFileName = resume.fileUrl ? resume.fileUrl.split("/").pop() || "Resume.pdf" : "Resume.pdf";

  // Dispatch email directly via user's SMTP credentials (or fallback to MOCK mode)
  const dispatchResult = await sendDirectEmail({
    userId: user.id,
    to: application.hrEmail,
    subject: emailDraft.subject,
    body: emailDraft.body,
    resume: {
      fileUrl: resume.fileUrl,
      parsedText: resume.parsedText,
      fileData: resume.fileData,
      mimeType: resume.mimeType,
    },
  });

  const now = new Date();
  // Directly move to Follow-Up 1, locked for 4 days!
  const nextActionAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

  const existingLogs = (application.logs as Array<Record<string, unknown>>) || [];
  const updatedLogs = [
    ...existingLogs,
    {
      action: "APPLY_SENT",
      stage: "APPLY",
      subject: emailDraft.subject,
      body: emailDraft.body,
      candidateEmail: dispatchResult.fromEmail || senderEmail,
      replyTo: dispatchResult.fromEmail || senderEmail,
      resumeAttached: resumeFileName,
      dispatchedAt: dispatchResult.dispatchedAt,
      messageId: dispatchResult.messageId,
      provider: dispatchResult.provider,
    },
  ];

  const updated = await withUserDb(user.id, (tx) =>
    tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        stage: "FOLLOW_UP_1",
        appliedAt: now,
        nextActionAt, // Locked for 4 days
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

  const now = new Date();

  // Enforce Time-Lock: check if enough days have passed for this specific company!
  if (application.nextActionAt && now < new Date(application.nextActionAt)) {
    const daysLeft = Math.ceil(
      (new Date(application.nextActionAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    throw new ApiError(
      400,
      "STAGE_LOCKED",
      `Follow-up is locked for this company. Please wait ${daysLeft} more day(s) until ${new Date(
        application.nextActionAt
      ).toLocaleDateString()} to follow up.`
    );
  }

  // Get candidate email
  const candidate = await getCandidateProfile(user.id);
  const senderEmail = candidate.email;

  // Generate or use custom email
  const emailDraft = customSubject && customBody
    ? { subject: customSubject, body: customBody, stage: targetStage }
    : await getJobEmailDraftForApp(user, applicationId);

  const dispatchResult = await sendDirectEmail({
    userId: user.id,
    to: application.hrEmail,
    subject: emailDraft.subject,
    body: emailDraft.body,
    threadId: application.emailThreadId,
    isFollowUp: true,
  });

  // Calculate next stage transition:
  // After Follow-Up 1 -> moves to Follow-Up 2, locked until Day 10 from initial application!
  // After Follow-Up 2 -> moves to Follow-Up 3, locked until Day 15 from initial application!
  // After Follow-Up 3 -> moves to CLOSED
  const appliedAt = application.appliedAt || now;
  let nextStage: string = "FOLLOW_UP_2";
  let nextActionAt: Date | null = null;

  if (targetStage === "FOLLOW_UP_1") {
    nextStage = "FOLLOW_UP_2";
    nextActionAt = new Date(appliedAt.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from apply
  } else if (targetStage === "FOLLOW_UP_2") {
    nextStage = "FOLLOW_UP_3";
    nextActionAt = new Date(appliedAt.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from apply
  } else {
    nextStage = "CLOSED";
    nextActionAt = null;
  }

  const existingLogs = (application.logs as Array<Record<string, unknown>>) || [];
  const updatedLogs = [
    ...existingLogs,
    {
      action: `${targetStage}_SENT`,
      stage: targetStage,
      subject: emailDraft.subject,
      body: emailDraft.body,
      candidateEmail: dispatchResult.fromEmail || senderEmail,
      replyTo: dispatchResult.fromEmail || senderEmail,
      dispatchedAt: dispatchResult.dispatchedAt,
      messageId: dispatchResult.messageId,
      provider: dispatchResult.provider,
    },
  ];

  return withUserDb(user.id, (tx) =>
    tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        stage: nextStage,
        nextActionAt,
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

        const dispatchResult = await sendDirectEmail({
          userId: app.userId,
          to: app.hrEmail,
          subject: draft.subject,
          body: draft.body,
          threadId: app.emailThreadId,
          isFollowUp: true,
          useSystemDb: true,
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
            candidateEmail: dispatchResult.fromEmail,
            dispatchedAt: dispatchResult.dispatchedAt,
            messageId: dispatchResult.messageId,
            provider: dispatchResult.provider,
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
