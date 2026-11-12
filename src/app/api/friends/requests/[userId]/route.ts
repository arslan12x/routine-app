import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { friendRequestActionBody } from "@/lib/validation";
import { respondToFriendRequest } from "@/server/services/friends";

export const PUT = route<{ userId: string }>(async (req, { userId }) => {
  if (!userId.trim()) throw new ApiError(400, "VALIDATION", "A user ID is required");
  const user = await requireUser();
  const body = await parseBody(req, friendRequestActionBody);
  return respondToFriendRequest(user, userId, body.action);
});
