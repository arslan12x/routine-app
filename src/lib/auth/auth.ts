import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { systemDb } from "@/lib/db";

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(systemDb, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 }, // DB-backed; no cookie cache, so revocation is immediate
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  onAPIError: { errorURL: "/access-denied" },
  plugins: [username({ displayUsername: false, immutableUsername: true }), nextCookies()],
  databaseHooks: {
    user: {
      create: {
        // Only pre-provisioned accounts can be created; public sign-up is disabled.
        before: async (user) => {
          const row = await systemDb.allowedEmail.findUnique({ where: { email: user.email.toLowerCase() } });
          if (!row || row.revokedAt) {
            throw new APIError("FORBIDDEN", { message: "This account has not been provisioned." });
          }
          return { data: user };
        },
      },
    },
    session: {
      create: {
        // Runs on EVERY sign-in: revoked users are blocked even though they already have an account.
        before: async (session) => {
          const u = await systemDb.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          const row = u && await systemDb.allowedEmail.findUnique({ where: { email: u.email.toLowerCase() } });
          if (!row || row.revokedAt) {
            throw new APIError("FORBIDDEN", { message: "Access has been revoked." });
          }
          return { data: session };
        },
      },
    },
  },
});
