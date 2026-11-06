import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { credentialEmail, normalizeUsername } from "../src/lib/auth/credentials";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } }),
});

async function main() {
  const username = normalizeUsername(process.env.INITIAL_ADMIN_USERNAME ?? "");
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Set INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD before seeding.");
  if (username.length < 3 || username.length > 30 || !/^[a-z0-9_.]+$/.test(username)) {
    throw new Error("INITIAL_ADMIN_USERNAME must be 3-30 letters, numbers, underscores, or periods.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be between 8 and 128 characters.");
  }

  const email = credentialEmail(username);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { username },
      update: { name: username, email, emailVerified: true },
      create: { id: crypto.randomUUID(), username, name: username, email, emailVerified: true },
    });
    await tx.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    const account = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
    if (account) {
      await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } });
    } else {
      await tx.account.create({
        data: { id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
      });
    }
    await tx.allowedEmail.upsert({
      where: { email },
      update: { role: "ADMIN", revokedAt: null },
      create: { email, role: "ADMIN" },
    });
  });
  console.log(`Seeded admin account: ${username}`);
}
main().finally(() => prisma.$disconnect());
