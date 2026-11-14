import { z } from "zod";
import { route, parseBody } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createWorkspace } from "@/server/services/admin";

const workspaceBody = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_.]+$/),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export const POST = route(async (request) => {
  const admin = await requirePlatformAdmin();
  const body = await parseBody(request, workspaceBody);
  return createWorkspace(admin, body.name, body.username, body.email, body.password);
}, 201);
