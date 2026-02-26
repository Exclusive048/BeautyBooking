import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { formatZodError } from "@/lib/api/validation";
import { toAppError } from "@/lib/api/errors";
import { visualSearchReindexSchema } from "@/lib/visual-search/schemas";
import { queueVisualSearchReindex } from "@/lib/visual-search/admin";

export async function POST(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = visualSearchReindexSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const data = await queueVisualSearchReindex(parsed.data);
    return ok(data);
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
