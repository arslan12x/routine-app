import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { joinWorkspaceChallenge, leaveWorkspaceChallenge } from "@/server/services/challenges";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  return joinWorkspaceChallenge(user, id);
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  return leaveWorkspaceChallenge(user, id);
});
