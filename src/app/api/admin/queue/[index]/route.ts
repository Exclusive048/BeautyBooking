import { fail, ok } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { deleteDeadJobByIndex, retryDeadJobByIndex } from "@/lib/queue/queue";

export const runtime = "nodejs";

function parseIndex(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const index = parseIndex(params.index);
  if (index === null) {
    return fail("Invalid index", 400, "VALIDATION_ERROR");
  }

  const moved = await retryDeadJobByIndex(index);
  if (!moved) {
    return fail("Dead queue item not found", 404, "NOT_FOUND");
  }

  return ok({ ok: true, index });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const index = parseIndex(params.index);
  if (index === null) {
    return fail("Invalid index", 400, "VALIDATION_ERROR");
  }

  const removed = await deleteDeadJobByIndex(index);
  if (!removed) {
    return fail("Dead queue item not found", 404, "NOT_FOUND");
  }

  return ok({ ok: true, index });
}

