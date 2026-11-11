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

  const mappingEntries = Object.entries(legacyMap);
  if (syntheticUsers.length === 0 && mappingEntries.length === 0) {
    console.log("No synthetic users found. Nothing to migrate.");
    return;
  }

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

  const allowlistEmailTargets = new Map<string, string>();
  for (const { user, targetEmail } of updates) {
    allowlistEmailTargets.set(user.email.toLowerCase(), targetEmail.toLowerCase());
  }
  for (const [legacyIdentifier, targetEmail] of mappingEntries) {
    const legacyEmail = legacyIdentifier.includes("@")
      ? legacyIdentifier
      : `${legacyIdentifier}@users.routine.invalid`;
    if (legacyEmail.endsWith("@users.routine.invalid")) {
      allowlistEmailTargets.set(legacyEmail, targetEmail);
    }
  }

  const mappedTargets = [...allowlistEmailTargets.values()];
  if (new Set(mappedTargets).size !== mappedTargets.length) {
    throw new Error("Multiple legacy accounts map to the same email address.");
  }

  const mappedTargetUsers = await prisma.user.findMany({
    where: { email: { in: mappedTargets } },
    select: { id: true, email: true },
  });
  const mappedTargetUserEmails = new Set(mappedTargetUsers.map(({ email }) => email.toLowerCase()));
  const pendingTargetUserEmails = new Set(updates.map(({ targetEmail }) => targetEmail.toLowerCase()));
  const missingTarget = mappedTargets.find(
    (email) => !mappedTargetUserEmails.has(email) && !pendingTargetUserEmails.has(email),
  );
  if (missingTarget) {
    throw new Error(`No account exists for mapped email ${missingTarget}.`);
  }

  const allowlistRows = await prisma.$queryRaw<
    Array<{ id: string; email: string; role: string; revokedAt: Date | null }>
  >`SELECT "id", "email", "role"::TEXT AS "role", "revokedAt" FROM public."AllowedEmail"`;
  const allowlistByEmail = new Map(allowlistRows.map((row) => [row.email.toLowerCase(), row]));
  const allowlistUpdates: Array<{ id: string; targetEmail: string }> = [];

  for (const [legacyEmail, targetEmail] of allowlistEmailTargets) {
    const legacyRow = allowlistByEmail.get(legacyEmail);
    if (!legacyRow) continue;

    const targetRow = allowlistByEmail.get(targetEmail);
    if (targetRow) {
      const sameRevocation =
        legacyRow.revokedAt?.getTime() === targetRow.revokedAt?.getTime() ||
        (!legacyRow.revokedAt && !targetRow.revokedAt);
      if (legacyRow.role !== targetRow.role || !sameRevocation) {
        throw new Error(`Legacy and real-email allowlist entries conflict for ${targetEmail}.`);
      }
      continue;
    }

    allowlistUpdates.push({ id: legacyRow.id, targetEmail });
  }

  const operations = [
    ...updates
      .filter(({ user, targetEmail }) => user.email.toLowerCase() !== targetEmail.toLowerCase())
      .map(({ user, targetEmail }) =>
        prisma.$executeRaw`
          UPDATE public."User"
          SET "email" = ${targetEmail}, "emailVerified" = true
          WHERE "id" = ${user.id}
        `,
      ),
    ...allowlistUpdates.map(({ id, targetEmail }) =>
      prisma.$executeRaw`
        UPDATE public."AllowedEmail"
        SET "email" = ${targetEmail}
        WHERE "id" = ${id}
      `,
    ),
  ];

  if (operations.length > 0) await prisma.$transaction(operations);

  for (const { user, username, targetEmail } of updates) {
    if (user.email.toLowerCase() === targetEmail.toLowerCase()) {
      console.log(`Skipped ${user.username ?? username}; already uses ${targetEmail}`);
    } else {
      console.log(`Updated ${user.username ?? username} -> ${targetEmail}`);
    }
  }
  for (const { targetEmail } of allowlistUpdates) {
    console.log(`Updated legacy allowlist entry -> ${targetEmail}`);
  }
  if (syntheticUsers.length === 0 && allowlistUpdates.length === 0) {
    console.log("No synthetic users or legacy allowlist entries required updates.");
  }
}

main().catch((error) => {
  console.error("Enterprise prep failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
