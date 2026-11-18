import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { challengeCreate } from "@/lib/validation";
import { createWorkspaceChallenge, listWorkspaceChallenges } from "@/server/services/challenges";

export const GET = route(async () => {
  return listWorkspaceChallenges(await requireUser());
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, challengeCreate);
  return createWorkspaceChallenge(user, body);
}, 201);
