import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getLatestCoachReview } from "@/server/ai/coach";

export const GET = route(async () => {
  const user = await requireUser();
  return getLatestCoachReview(user.id);
});
