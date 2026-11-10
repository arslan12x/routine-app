import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function makeSystemClient() {
  // Supabase's pooler certificate chain is not in Node's trust store; the connection stays
  // encrypted but the certificate is not verified. Pin Supabase's CA here for stricter security.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });
  return new PrismaClient({ adapter });
}

function makeScopedClient(client: PrismaClient) {
  return client.$extends({
    name: "user-scoped-database",
    client: {
      withUserScope<T>(userId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
        if (!userId) throw new Error("A user ID is required for a scoped database operation.");
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL ROLE authenticated`;
          const claims = JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" });
          await tx.$queryRaw`
            SELECT
              set_config('request.jwt.claims', ${claims}, true),
              set_config('request.jwt.claim.sub', ${userId}, true),
              set_config('request.jwt.claim.role', 'authenticated', true)
          `;
          return operation(tx);
        });
      },
    },
  });
}

type ScopedPrisma = ReturnType<typeof makeScopedClient>;
type DatabaseClients = {
  systemPrisma?: PrismaClient;
  scopedPrisma?: ScopedPrisma;
};
const g = globalThis as unknown as DatabaseClients;

const systemPrisma = g.systemPrisma ?? makeSystemClient();
const scopedPrisma = g.scopedPrisma ?? makeScopedClient(systemPrisma);
export const systemDb = systemPrisma;

export function withUserDb<T>(userId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return scopedPrisma.withUserScope(userId, operation);
}

if (process.env.NODE_ENV !== "production") {
  g.systemPrisma = systemPrisma;
  g.scopedPrisma = scopedPrisma;
}
