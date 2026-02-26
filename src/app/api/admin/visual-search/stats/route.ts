import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { toAppError } from "@/lib/api/errors";
import { getVisualSearchStats } from "@/lib/visual-search/admin";

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const data = await getVisualSearchStats();
    return ok(data);
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
