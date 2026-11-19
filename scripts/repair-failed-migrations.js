const { Client } = require("pg");

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[pre-deploy] No database connection string found; skipping migration repair check.");
    return;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
      );
    `);

    if (tableCheck.rows[0]?.exists) {
      const failed = await client.query(`
        SELECT migration_name FROM public._prisma_migrations 
        WHERE finished_at IS NULL AND rolled_back_at IS NULL;
      `);

      if (failed.rows.length > 0) {
        console.log(`[pre-deploy] Found ${failed.rows.length} unrecovered failed migration(s):`, failed.rows.map((r) => r.migration_name));
        await client.query(`
          UPDATE public._prisma_migrations 
          SET rolled_back_at = NOW() 
          WHERE finished_at IS NULL AND rolled_back_at IS NULL;
        `);
        console.log("[pre-deploy] Successfully marked failed migration(s) as rolled back so prisma migrate deploy can retry with idempotent SQL.");
      } else {
        console.log("[pre-deploy] No blocked failed migrations found.");
      }
    }
  } catch (err) {
    console.warn("[pre-deploy] Notice during migration recovery check:", err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
