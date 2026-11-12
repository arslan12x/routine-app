import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import { withUserDb } from "@/lib/db";

type FriendshipStatus = "NONE" | "REQUESTED" | "INCOMING" | "FRIENDS";

interface DiscoverableProfile {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  displayName: string | null;
}

function profileName(profile: DiscoverableProfile) {
  return profile.displayName ?? profile.username ?? profile.name;
}

export async function discoverFriends(user: AppUser) {
  const { profiles, friendships } = await withUserDb(user.id, async (tx) => {
    const [profiles, friendships] = await Promise.all([
      tx.$queryRaw<DiscoverableProfile[]>`SELECT * FROM public.discoverable_users() ORDER BY "username"`,
      tx.friendship.findMany({
        where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
        select: { requesterId: true, addresseeId: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { profiles, friendships };
  });
  const states = new Map<string, FriendshipStatus>();
  const incoming = new Map<string, Date>();
  for (const friendship of friendships) {
    const otherId = friendship.requesterId === user.id ? friendship.addresseeId : friendship.requesterId;
    if (friendship.status === "ACCEPTED") {
      states.set(otherId, "FRIENDS");
    } else if (friendship.addresseeId === user.id) {
      states.set(otherId, "INCOMING");
      incoming.set(otherId, friendship.createdAt);
    } else {
      states.set(otherId, "REQUESTED");
    }
  }
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const project = (profile: DiscoverableProfile) => ({
    id: profile.id,
    username: profile.username,
    displayName: profileName(profile),
    image: profile.image,
  });

  return {
    users: profiles.map((profile) => ({
      ...project(profile),
      friendshipStatus: states.get(profile.id) ?? "NONE",
    })),
    incomingRequests: [...incoming].flatMap(([id, createdAt]) => {
      const requester = byId.get(id);
      return requester ? [{ ...project(requester), createdAt: createdAt.toISOString() }] : [];
    }),
  };
}

export async function createFriendRequest(user: AppUser, targetId: string) {
  if (targetId === user.id) throw new ApiError(400, "INVALID_REQUEST", "You cannot add yourself");

  try {
    return await withUserDb(user.id, async (tx) => {
      const target = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public.discoverable_users() WHERE "id" = ${targetId}
      `;
      if (target.length === 0) throw new ApiError(404, "NOT_FOUND", "That account is not available");

      const existing = await tx.friendship.findFirst({
        where: {
          OR: [
            { requesterId: user.id, addresseeId: targetId },
            { requesterId: targetId, addresseeId: user.id },
          ],
        },
        select: { status: true, requesterId: true },
      });
      if (existing) {
        const message = existing.status === "ACCEPTED"
          ? "You are already friends"
          : existing.requesterId === user.id
            ? "A request has already been sent"
            : "This person has already sent you a request";
        throw new ApiError(409, "ALREADY_EXISTS", message);
      }

      await tx.friendship.create({
        data: { id: crypto.randomUUID(), requesterId: user.id, addresseeId: targetId },
        select: { id: true },
      });
      return { status: "REQUESTED" as const };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "ALREADY_EXISTS", "A request or friendship already exists");
    }
    throw error;
  }
}

export async function respondToFriendRequest(user: AppUser, requesterId: string, action: "accept" | "decline") {
  return withUserDb(user.id, async (tx) => {
    const request = await tx.friendship.findFirst({
      where: { requesterId, addresseeId: user.id, status: "PENDING" },
      select: { id: true },
    });
    if (!request) throw new ApiError(404, "NOT_FOUND", "Pending friend request not found");

    if (action === "accept") {
      const result = await tx.friendship.updateMany({
        where: { id: request.id, addresseeId: user.id, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (result.count !== 1) throw new ApiError(409, "ALREADY_RESOLVED", "This request has already been resolved");
      return { status: "ACCEPTED" as const };
    }

    const result = await tx.friendship.deleteMany({
      where: { id: request.id, addresseeId: user.id, status: "PENDING" },
    });
    if (result.count !== 1) throw new ApiError(409, "ALREADY_RESOLVED", "This request has already been resolved");
    return { status: "DECLINED" as const };
  });
}
