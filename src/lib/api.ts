import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: unknown) {
    super(message);
  }
}

/** Mutating requests must come from our own origin (defence in depth on top of SameSite=Lax cookies). */
function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) throw new ApiError(403, "BAD_ORIGIN", "Cross-origin request blocked");
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function route<P extends Record<string, string> = {}>(
  fn: (req: Request, params: P) => Promise<unknown>,
  status = 200,
) {
  return async (req: Request, ctx: { params: Promise<unknown> }) => {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      assertSameOrigin(req);
      const data = await fn(req, await ctx.params as P);
      if (data === undefined) return new Response(null, { status: 204, headers });
      return Response.json({ data }, { status, headers });
    } catch (e) {
      if (e instanceof ApiError) {
        return Response.json({ error: { code: e.code, message: e.message, fields: e.fields } }, { status: e.status, headers });
      }
      console.error(e);
      return Response.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500, headers });
    }
  };
}

function check<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ApiError(400, "VALIDATION", "Invalid input", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return r.data;
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "UNSUPPORTED", "Expected application/json");
  return check(schema, await req.json().catch(() => null));
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  return check(schema, Object.fromEntries(new URL(req.url).searchParams));
}
