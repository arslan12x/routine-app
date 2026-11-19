import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { CsvFinancialProvider } from "@/server/finance/csv-provider";
import { importExpensesFromProvider } from "@/server/services/finance";
import { ApiError } from "@/lib/api";

export const runtime = "nodejs";

const importSchema = z.object({
  csvData: z.string().min(5),
});

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "VALIDATION", message: error.issues[0]?.message || "Invalid input" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error("[Finance CSV Import API] Failed", error);
  return Response.json(
    { error: { code: "SERVER_ERROR", message: "Failed to import statement" } },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json = await request.json().catch(() => ({}));
    const validated = importSchema.parse(json);

    const provider = new CsvFinancialProvider();
    const result = await importExpensesFromProvider(user.id, provider, validated.csvData);

    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
