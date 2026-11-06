import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

/** Whitelist check. The INITIAL_ADMIN_EMAIL is always allowed and becomes the first ADMIN. */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const boot = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (boot && e === boot) {
    await prisma.allowedEmail.upsert({ where: { email: e }, update: {}, create: { email: e, role: "ADMIN" } });
  }
  const row = await prisma.allowedEmail.findUnique({ where: { email: e } });
  return !!row && !row.revokedAt;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID as string, clientSecret: process.env.GOOGLE_CLIENT_SECRET as string },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 }, // DB-backed; no cookie cache, so revocation is immediate
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  onAPIError: { errorURL: "/access-denied" },
  databaseHooks: {
    user: {
      create: {
        // Runs before a NEW account is created: unknown or unverified emails never get a user row.
        before: async (user) => {
          if (!user.emailVerified || !(await isEmailAllowed(user.email))) {
            throw new APIError("FORBIDDEN", { message: "This email has not been invited." });
          }
          return { data: user };
        },
      },
    },
    session: {
      create: {
        // Runs on EVERY sign-in: revoked users are blocked even though they already have an account.
        before: async (session) => {
          const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          if (!u || !(await isEmailAllowed(u.email))) {
            throw new APIError("FORBIDDEN", { message: "Access has been revoked." });
          }
          return { data: session };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
