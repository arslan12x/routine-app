import { ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const listAllowed = () =>
  prisma.allowedEmail.findMany({ orderBy: { createdAt: "asc" }, select: { email: true, role: true, revokedAt: true, createdAt: true } });

export async function addAllowed(admin: AppUser, emailRaw: string, role: "MEMBER" | "ADMIN") {
  const email = emailRaw.trim().toLowerCase();
  await prisma.allowedEmail.upsert({
    where: { email },
    update: { revokedAt: null, role },
    create: { email, role, addedBy: admin.id },
  });
  return { email };
}

export async function revokeAllowed(admin: AppUser, emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (email === admin.email.toLowerCase()) throw new ApiError(400, "SELF_REVOKE", "You cannot revoke your own access");
  const row = await prisma.allowedEmail.findUnique({ where: { email } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Email not found");
  await prisma.$transaction([
    prisma.allowedEmail.update({ where: { email }, data: { revokedAt: new Date() } }),
    prisma.session.deleteMany({ where: { user: { email } } }), // kicks them out immediately
  ]);
}
