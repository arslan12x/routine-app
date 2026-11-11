import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { normalizeUsername } from "../src/lib/auth/credentials";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } }),
});

async function main() {
  const username = normalizeUsername(process.env.INITIAL_ADMIN_USERNAME ?? "");
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const email = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();

  if (!username || !password || !email) throw new Error("Set INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD before seeding.");
  if (username.length < 3 || username.length > 30 || !/^[a-z0-9_.]+$/.test(username)) {
    throw new Error("INITIAL_ADMIN_USERNAME must be 3-30 letters, numbers, underscores, or periods.");
  }
  if (!email.includes("@")) throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
  if (password.length < 8 || password.length > 128) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be between 8 and 128 characters.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.upsert({
      where: { slug: "routine-workspace" },
      update: { name: "Routine Workspace" },
      create: { id: crypto.randomUUID(), name: "Routine Workspace", slug: "routine-workspace" },
    });

    const user = await tx.user.upsert({
      where: { username },
      update: { name: username, email, emailVerified: true, banned: false },
      create: { id: crypto.randomUUID(), username, name: username, email, emailVerified: true },
    });

    await tx.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    await tx.member.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role: "owner" },
      create: { id: crypto.randomUUID(), organizationId: organization.id, userId: user.id, role: "owner" },
    });

    const account = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
    if (account) {
      await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } });
    } else {
      await tx.account.create({
        data: { id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
      });
    }
  });
  console.log(`Seeded admin account: ${username} (${email})`);
}
main().finally(() => prisma.$disconnect());
