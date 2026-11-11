import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  }),
});

function parseLegacyAccountEmails(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [String(k).trim().toLowerCase(), String(v).trim().toLowerCase()]),
      );
    }
  } catch {
    // Fall back to CSV parsing below.
  }

  const result: Record<string, string> = {};
  for (const item of trimmed.split(",")) {
    const entry = item.trim();
    if (!entry) continue;
    if (entry.includes("=")) {
      const [key, ...rest] = entry.split("=");
      const value = rest.join("=").trim();
      if (key && value) result[key.trim().toLowerCase()] = value.trim().toLowerCase();
      continue;
    }
    if (entry.includes("@")) {
      result[entry.toLowerCase()] = entry.toLowerCase();
    }
  }
  return result;
}

async function main() {
  const legacyMap = parseLegacyAccountEmails(process.env.LEGACY_ACCOUNT_EMAILS);
  const fallbackEmail = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();

  const syntheticUsers = await prisma.user.findMany({
    where: { email: { contains: "@users.routine.invalid" } },
    select: { id: true, username: true, email: true },
  });

  if (syntheticUsers.length === 0) {
    console.log("No synthetic users found. Nothing to migrate.");
    return;
  }

  const mappingEntries = Object.entries(legacyMap);
  const directFallback = mappingEntries.length === 1 && !mappingEntries[0][0].includes("@") && mappingEntries[0][1].includes("@")
    ? { [mappingEntries[0][0]]: mappingEntries[0][1] }
    : {};

  const updates = syntheticUsers.map((user) => {
    const username = (user.username ?? user.email.replace(/@users\.routine\.invalid$/i, "")).trim().toLowerCase();
    const targetEmail =
      legacyMap[username] ??
      legacyMap[user.email.toLowerCase()] ??
      directFallback[username] ??
      (mappingEntries.length === 1 && !mappingEntries[0][0].includes("@") ? mappingEntries[0][1] : undefined) ??
      (syntheticUsers.length === 1 ? fallbackEmail : undefined);

    if (!targetEmail || !targetEmail.includes("@")) {
      throw new Error(
        `Missing real email for legacy user "${user.username ?? username}". Add "${username}=you@example.com" to LEGACY_ACCOUNT_EMAILS or set INITIAL_ADMIN_EMAIL.`,
      );
    }

    return { user, username, targetEmail };
  });

  const targetEmails = updates.map(({ targetEmail }) => targetEmail.toLowerCase());
  if (new Set(targetEmails).size !== targetEmails.length) {
    throw new Error("Multiple legacy accounts map to the same email address.");
  }

  const existingUsers = await prisma.user.findMany({
    where: { email: { in: targetEmails } },
    select: { id: true, email: true },
  });
  const userIds = new Set(syntheticUsers.map(({ id }) => id));
  const conflict = existingUsers.find((user) => !userIds.has(user.id));
  if (conflict) {
    throw new Error(`Target email ${conflict.email} is already assigned to another account.`);
  }

  await prisma.$transaction(
    updates
      .filter(({ user, targetEmail }) => user.email.toLowerCase() !== targetEmail.toLowerCase())
      .map(({ user, targetEmail }) =>
        prisma.$executeRaw`
          UPDATE public."User"
          SET "email" = ${targetEmail}, "emailVerified" = true
          WHERE "id" = ${user.id}
        `,
      ),
  );

  for (const { user, username, targetEmail } of updates) {
    if (user.email.toLowerCase() === targetEmail.toLowerCase()) {
      console.log(`Skipped ${user.username ?? username}; already uses ${targetEmail}`);
    } else {
      console.log(`Updated ${user.username ?? username} -> ${targetEmail}`);
    }
  }
}

main().catch((error) => {
  console.error("Enterprise prep failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
