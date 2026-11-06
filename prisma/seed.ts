import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } }),
});

async function main() {
  const admin = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (admin) {
    await prisma.allowedEmail.upsert({ where: { email: admin }, update: { role: "ADMIN", revokedAt: null }, create: { email: admin, role: "ADMIN" } });
  }
  const others = (process.env.SEED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const email of others) {
    await prisma.allowedEmail.upsert({ where: { email }, update: { revokedAt: null }, create: { email } });
  }
  console.log("Seeded:", [admin, ...others].filter(Boolean));
}
main().finally(() => prisma.$disconnect());
