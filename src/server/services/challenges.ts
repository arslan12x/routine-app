import { withUserDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import type { ChallengeCreate } from "@/lib/validation";
import { parse, todayIn } from "@/lib/domain/dates";
import { d2s, s2d } from "@/server/repositories/tasks";
import type { Category } from "@/lib/domain/types";

export interface ChallengeContributor {
  userId: string;
  name: string;
  contributed: number;
}

export interface ChallengeView {
  id: string;
  title: string;
  description: string | null;
  category: Category | null;
  unit: string | null;
  target: number;
  currentValue: number;
  progressPct: number;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  daysRemaining: number;
  isJoined: boolean;
  participantCount: number;
  creatorName: string;
  topContributors: ChallengeContributor[];
}

export async function listWorkspaceChallenges(user: AppUser): Promise<ChallengeView[]> {
  const today = todayIn(user.timezone);

  return withUserDb(user.id, async (tx) => {
    const challenges = await tx.challenge.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        participants: { select: { userId: true } },
        creator: {
          select: {
            id: true,
            name: true,
            username: true,
            settings: { select: { displayName: true } },
          },
        },
      },
    });

    const results: ChallengeView[] = [];

    for (const challenge of challenges) {
      const participantIds = challenge.participants.map((p) => p.userId);
      const isJoined = participantIds.includes(user.id);
      const startStr = d2s(challenge.startDate);
      const endStr = d2s(challenge.endDate);

      // Compute days remaining
      const todayDate = parse(today);
      const endDate = parse(endStr);
      const diffMs = endDate.getTime() - todayDate.getTime();
      const daysRemaining = diffMs >= 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

      // Aggregate matching task logs across participating workspace members
      let currentValue = 0;
      let topContributors: ChallengeContributor[] = [];

      if (participantIds.length > 0) {
        const logs = await tx.taskLog.findMany({
          where: {
            userId: { in: participantIds },
            localDate: {
              gte: challenge.startDate,
              lte: challenge.endDate,
            },
            task: {
              ...(challenge.category ? { category: challenge.category } : {}),
              versions: {
                some: {
                  completionType: "MEASURABLE",
                  ...(challenge.unit ? { unit: { equals: challenge.unit, mode: "insensitive" } } : {}),
                },
              },
            },
          },
          select: {
            userId: true,
            value: true,
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                settings: { select: { displayName: true } },
              },
            },
          },
        });

        const contributionByUser = new Map<string, { name: string; contributed: number }>();
        let sum = 0;

        for (const log of logs) {
          sum += log.value;
          const name = log.user.settings?.displayName || log.user.name || log.user.username || "Team Member";
          const existing = contributionByUser.get(log.userId);
          if (existing) {
            existing.contributed += log.value;
          } else {
            contributionByUser.set(log.userId, { name, contributed: log.value });
          }
        }

        currentValue = Math.round(sum * 10) / 10;
        topContributors = Array.from(contributionByUser.entries())
          .map(([uid, c]) => ({ userId: uid, name: c.name, contributed: Math.round(c.contributed * 10) / 10 }))
          .sort((a, b) => b.contributed - a.contributed)
          .slice(0, 5);
      }

      const progressPct = Math.min(100, Math.round((currentValue / challenge.target) * 100));
      const creatorName = challenge.creator.settings?.displayName || challenge.creator.name || challenge.creator.username || "Admin";

      results.push({
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        category: challenge.category as Category | null,
        unit: challenge.unit,
        target: challenge.target,
        currentValue,
        progressPct,
        startDate: startStr,
        endDate: endStr,
        status: challenge.status as "ACTIVE" | "COMPLETED" | "ARCHIVED",
        daysRemaining,
        isJoined,
        participantCount: participantIds.length,
        creatorName,
        topContributors,
      });
    }

    return results;
  });
}

export async function createWorkspaceChallenge(user: AppUser, input: ChallengeCreate): Promise<{ id: string }> {
  return withUserDb(user.id, async (tx) => {
    const challenge = await tx.challenge.create({
      data: {
        organizationId: user.organizationId,
        creatorId: user.id,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        unit: input.unit?.trim().toLowerCase() ?? null,
        target: input.target,
        startDate: s2d(input.startDate),
        endDate: s2d(input.endDate),
        status: "ACTIVE",
        participants: {
          create: {
            userId: user.id,
          },
        },
      },
    });

    return { id: challenge.id };
  });
}

export async function joinWorkspaceChallenge(user: AppUser, challengeId: string): Promise<{ success: boolean }> {
  return withUserDb(user.id, async (tx) => {
    const challenge = await tx.challenge.findFirst({
      where: { id: challengeId, organizationId: user.organizationId },
    });
    if (!challenge) throw new ApiError(404, "NOT_FOUND", "Challenge not found");

    await tx.challengeParticipant.upsert({
      where: { challengeId_userId: { challengeId, userId: user.id } },
      create: { challengeId, userId: user.id },
      update: {},
    });

    return { success: true };
  });
}

export async function leaveWorkspaceChallenge(user: AppUser, challengeId: string): Promise<{ success: boolean }> {
  return withUserDb(user.id, async (tx) => {
    await tx.challengeParticipant.deleteMany({
      where: { challengeId, userId: user.id },
    });
    return { success: true };
  });
}
