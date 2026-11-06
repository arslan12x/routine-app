import { route, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { taskCreate } from "@/lib/validation";
import { createTask, listTasks } from "@/server/services/tasks";
export const GET = route(async () => listTasks((await requireUser()).id));
export const POST = route(async (req) => createTask(await requireUser(), await parseBody(req, taskCreate)), 201);
