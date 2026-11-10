import { systemDb } from "@/lib/db";
export const dynamic = "force-dynamic";
// Public keep-alive endpoint (also stops the Supabase free tier pausing). Returns no data.
export async function GET() {
  try {
    await systemDb.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
