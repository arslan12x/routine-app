import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listNovels } from "@/server/services/novels";

const novelsQuerySchema = z.object({
  genre: z.string().optional(),
  search: z.string().optional(),
});

export const GET = route(async (req) => {
  let userId: string | undefined;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    // Unauthenticated requests still get the public catalog
  }

  const query = parseQuery(req, novelsQuerySchema);
  const { novels, activeNovel } = await listNovels(userId, query.genre, query.search);
  return { novels, activeNovel };
});
