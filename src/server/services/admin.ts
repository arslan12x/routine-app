import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { hashPassword } from "better-auth/crypto";
import { normalizeUsername } from "@/lib/auth/credentials";

function toAppRole(role: string): "ADMIN" | "MEMBER" {
  return role === "owner" || role === "admin" ? "ADMIN" : "MEMBER";
}

export function rethrowIfAdminSchemaMissing(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
    throw new ApiError(
      503,
      "MIGRATION_REQUIRED",
      "The admin database schema is not up to date. Apply the checked-in Prisma migrations to this deployment's database.",
    );
  }
  throw error;
}

function audit(tx: Prisma.TransactionClient, admin: AppUser, action: string, targetUserId?: string, metadata?: Prisma.InputJsonValue) {
  return tx.auditLog.create({
    data: {
      actorId: admin.id,
      organizationId: admin.organizationId,
      targetUserId,
      action,
      metadata,
    },
  });
}

export async function listAllowed(organizationId: string) {
  const rows = await systemDb.member.findMany({
    where: { organizationId },
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

export async function listAuditLog(organizationId: string) {
  const rows = await systemDb.auditLog.findMany({
    where: { organizationId },
    orderBy: { timestamp: "desc" },
    take: 100,
    select: {
      id: true,
      timestamp: true,
      action: true,
      metadata: true,
      actor: { select: { username: true, name: true } },
      targetUserId: true,
    },
  });
  return rows.map(({ actor, ...entry }) => ({
    ...entry,
    timestamp: entry.timestamp.toISOString(),
    actor: actor.username ?? actor.name,
  }));
}

export async function addAllowed(admin: AppUser, usernameRaw: string, emailRaw: string, password: string, role: "MEMBER" | "ADMIN") {
  const username = normalizeUsername(usernameRaw);
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new ApiError(400, "VALIDATION", "A valid email address is required");

  const existing = await systemDb.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) throw new ApiError(409, "ALREADY_EXISTS", "That username already has an account");

  const normalizedRole = role === "ADMIN" ? "admin" : "member";
  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();

  await systemDb.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        id: userId,
        username,
        name: username,
        email,
        emailVerified: true,
        role: "user",
        members: {
          create: {
            id: crypto.randomUUID(),
            organizationId: admin.organizationId,
            role: normalizedRole,
          },
        },
      },
    });

    await tx.userSettings.create({ data: { userId: createdUser.id } });
    await tx.account.create({
      data: { id: crypto.randomUUID(), accountId: createdUser.id, providerId: "credential", userId: createdUser.id, password: passwordHash },
    });
    await audit(tx, admin, "ACCOUNT_CREATED", createdUser.id, { username, role });
  });

  return { username };
}

export async function createWorkspace(admin: AppUser, nameRaw: string, usernameRaw: string, emailRaw: string, password: string) {
  const name = nameRaw.trim();
  const username = normalizeUsername(usernameRaw);
  const email = emailRaw.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "VALIDATION", "Workspace name must be 2 to 80 characters");
  if (!email || !email.includes("@")) throw new ApiError(400, "VALIDATION", "A valid email address is required");

  const existingUser = await systemDb.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });
  if (existingUser) throw new ApiError(409, "ALREADY_EXISTS", "That username or email already has an account");

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
  const workspaceId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await systemDb.$transaction(async (tx) => {
    await tx.organization.create({ data: { id: workspaceId, name, slug } });
    await tx.user.create({
      data: {
        id: ownerId,
        username,
        name: username,
        email,
        emailVerified: true,
        role: "user",
        members: { create: { id: crypto.randomUUID(), organizationId: workspaceId, role: "owner" } },
      },
    });
    await tx.userSettings.create({ data: { userId: ownerId } });
    await tx.account.create({
      data: { id: crypto.randomUUID(), accountId: ownerId, providerId: "credential", userId: ownerId, password: passwordHash },
    });
    await audit(tx, admin, "WORKSPACE_CREATED", ownerId, { workspaceId, workspaceName: name, ownerUsername: username });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        organizationId: workspaceId,
        targetUserId: ownerId,
        action: "WORKSPACE_PROVISIONED",
        metadata: { workspaceName: name, ownerUsername: username, createdFromWorkspaceId: admin.organizationId },
      },
    });
  });

  return { id: workspaceId, name, slug, ownerUsername: username };
}

async function findWorkspaceUser(organizationId: string, username: string) {
  const user = await systemDb.user.findFirst({
    where: { username, members: { some: { organizationId } } },
    select: { id: true, banned: true },
  });
  if (!user) throw new ApiError(404, "NOT_FOUND", "Account not found in this workspace");
  return user;
}

export async function revokeAllowed(admin: AppUser, usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  if (username === admin.username) throw new ApiError(400, "SELF_REVOKE", "You cannot revoke your own access");

  const user = await findWorkspaceUser(admin.organizationId, username);
  if (user.banned) return;

  await systemDb.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { banned: true } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, admin, "ACCOUNT_REVOKED", user.id, { username });
  });
}

export async function restoreAllowed(admin: AppUser, usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  const user = await findWorkspaceUser(admin.organizationId, username);
  if (!user.banned) return;

  await systemDb.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { banned: false } });
    await audit(tx, admin, "ACCOUNT_RESTORED", user.id, { username });
  });
}
