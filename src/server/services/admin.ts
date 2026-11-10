import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { hashPassword } from "better-auth/crypto";
import { credentialEmail, normalizeUsername, usernameFromCredentialEmail } from "@/lib/auth/credentials";

export async function listAllowed() {
  const rows = await systemDb.allowedEmail.findMany({ orderBy: { createdAt: "asc" }, select: { email: true, role: true, revokedAt: true } });
  return rows.flatMap((row) => {
    const username = usernameFromCredentialEmail(row.email);
    return username ? [{ username, role: row.role, revokedAt: row.revokedAt }] : [];
  });
}

export async function addAllowed(admin: AppUser, usernameRaw: string, password: string, role: "MEMBER" | "ADMIN") {
  const username = normalizeUsername(usernameRaw);
  const email = credentialEmail(username);
  const existing = await systemDb.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) throw new ApiError(409, "ALREADY_EXISTS", "That username already has an account");

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await systemDb.$transaction(async (tx) => {
    await tx.allowedEmail.upsert({
      where: { email },
      update: { revokedAt: null, role, addedBy: admin.id },
      create: { email, role, addedBy: admin.id },
    });
    await tx.user.create({ data: { id: userId, username, name: username, email, emailVerified: true } });
    await tx.userSettings.create({ data: { userId } });
    await tx.account.create({
      data: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash },
    });
  });
  return { username };
}

export async function revokeAllowed(admin: AppUser, usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  if (username === admin.username) throw new ApiError(400, "SELF_REVOKE", "You cannot revoke your own access");
  const email = credentialEmail(username);
  const row = await systemDb.allowedEmail.findUnique({ where: { email } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Account not found");
  await systemDb.$transaction([
    systemDb.allowedEmail.update({ where: { email }, data: { revokedAt: new Date() } }),
    systemDb.session.deleteMany({ where: { user: { email } } }), // kicks them out immediately
  ]);
}

export async function restoreAllowed(usernameRaw: string) {
  const email = credentialEmail(usernameRaw);
  const row = await systemDb.allowedEmail.findUnique({ where: { email } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Account not found");
  await systemDb.allowedEmail.update({ where: { email }, data: { revokedAt: null } });
}
