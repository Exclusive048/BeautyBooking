import { fail, ok } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { getAdminDuplicateGroups } from "@/features/admin-cabinet/cities/server/duplicates.service";

export const runtime = "nodejs";

/**
 * Returns the full `AdminDuplicateGroup[]` array — used by the
 * "Найти дубли" modal in the admin/cities UI. The list endpoint
 * (`/api/admin/cities`) returns only `duplicateGroupId` per row; this
 * endpoint returns the entire group structure so the modal can render
 * canonical/duplicate relationships and pre-fill the merge dialog.
 */
export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const groups = await getAdminDuplicateGroups();
    return ok({ groups });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(
      appError.message,
      appError.status,
      appError.code,
      appError.details,
    );
  }
}
