import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, organization, username } from "better-auth/plugins";
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
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  onAPIError: { errorURL: "/access-denied" },
  plugins: [
    username({ displayUsername: false, immutableUsername: true }),
    organization({
      allowUserToCreateOrganization: false,
      creatorRole: "owner",
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin", "owner"],
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!user.email || !user.email.includes("@")) {
            throw new APIError("FORBIDDEN", { message: "A real email address is required for this account." });
          }
          return { data: user };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await systemDb.user.findUnique({
            where: { id: session.userId },
            select: { id: true, banned: true, members: { select: { id: true }, take: 1 } },
          });
          if (!user || user.banned || user.members.length === 0) {
            throw new APIError("FORBIDDEN", { message: "This account is not active in an organization." });
          }
          return { data: session };
        },
      },
    },
  },
});
