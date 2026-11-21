import { route, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { syncRecruiterRepliesForUser } from "@/server/services/email-inbox";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async () => {
  const user = await requireUser();

  const result = await syncRecruiterRepliesForUser(user.id, false);

  if (result.error) {
    throw new ApiError(400, "EMAIL_SYNC_FAILED", result.error);
  }

  return {
    checkedCount: result.checkedCount,
    repliesFound: result.repliesFound,
    updatedApplicationIds: result.updatedApplicationIds,
  };
});
