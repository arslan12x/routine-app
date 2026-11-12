import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { friendRequestBody } from "@/lib/validation";
import { createFriendRequest } from "@/server/services/friends";

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, friendRequestBody);
  return createFriendRequest(user, body.userId);
});
