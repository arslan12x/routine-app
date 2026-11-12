import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { hashPassword } from "better-auth/crypto";
import { normalizeUsername } from "@/lib/auth/credentials";

const DEFAULT_ORG_SLUG = "routine-workspace";
const DEFAULT_ORG_NAME = "Routine Workspace";

function toAppRole(role: string): "ADMIN" | "MEMBER" {
  return role === "owner" || role === "admin" ? "ADMIN" : "MEMBER";
}

async function ensureDefaultOrganization(tx: Prisma.TransactionClient) {
  const existing = await tx.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } });
  if (existing) return existing;
  return tx.organization.create({
    data: { id: crypto.randomUUID(), name: DEFAULT_ORG_NAME, slug: DEFAULT_ORG_SLUG },
  });
}

export async function listAllowed() {
  const rows = await systemDb.member.findMany({
    where: { organization: { slug: DEFAULT_ORG_SLUG } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      user: { select: { username: true, banned: true } },
    },
  });

  return rows.map(({ user, role }) => ({
    username: user.username ?? "",
    role: toAppRole(role),
    revokedAt: user.banned ? new Date().toISOString() : null,
  }));
}

export async function addAllowed(admin: AppUser, usernameRaw: string, emailRaw: string, password: string, role: "MEMBER" | "ADMIN") {
  const username = normalizeUsername(usernameRaw);
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new ApiError(400, "VALIDATION", "A valid email address is required");

  const existing = await systemDb.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) throw new ApiError(409, "ALREADY_EXISTS", "That username already has an account");

  const normalizedRole = role === "ADMIN" ? "admin" : "member";
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await systemDb.$transaction(async (tx) => {
    const org = await ensureDefaultOrganization(tx);
    const createdUser = await tx.user.create({
      data: {
        id: userId,
        username,
        name: username,
        email,
        emailVerified: true,
        role: role === "ADMIN" ? "admin" : "user",
        members: {
          create: {
            id: crypto.randomUUID(),
            organizationId: org.id,
            role: normalizedRole,
          },
        },
      },
    });

    await tx.userSettings.create({ data: { userId: createdUser.id } });
    await tx.account.create({
      data: { id: crypto.randomUUID(), accountId: createdUser.id, providerId: "credential", userId: createdUser.id, password: passwordHash },
    });
  });

  return { username };
}

export async function revokeAllowed(admin: AppUser, usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  if (username === admin.username) throw new ApiError(400, "SELF_REVOKE", "You cannot revoke your own access");

  const user = await systemDb.user.findUnique({ where: { username }, select: { id: true, banned: true } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "Account not found");
  if (user.banned) return;

  await systemDb.$transaction([
    systemDb.user.update({ where: { username }, data: { banned: true } }),
    systemDb.session.deleteMany({ where: { user: { username } } }),
  ]);
}

export async function restoreAllowed(usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  const user = await systemDb.user.findUnique({ where: { username }, select: { id: true, banned: true } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "Account not found");
  if (!user.banned) return;
  await systemDb.user.update({ where: { username }, data: { banned: false } });
}
