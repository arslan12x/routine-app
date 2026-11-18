import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { updateReadingSession } from "@/server/services/novels";

const sessionBodySchema = z.object({
  status: z.enum(["READING", "COMPLETED"]),
});

export const POST = route<{ id: string }>(async (req, params) => {
  const user = await requireUser();
  const body = await parseBody(req, sessionBodySchema);
  return updateReadingSession(user.id, params.id, body.status);
});
