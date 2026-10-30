import { fail, ok } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminAuditLogSafe } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { deleteDeadJobByIndex, retryDeadJobByIndex } from "@/lib/queue/queue";

export const runtime = "nodejs";

function parseIndex(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const index = parseIndex(params.index);
  if (index === null) {
    return fail("Некорректный индекс.", 400, "VALIDATION_ERROR");
  }

  const moved = await retryDeadJobByIndex(index);
  if (!moved) {
    return fail("Задача в очереди не найдена.", 404, "NOT_FOUND");
  }
  // Инв. #19: задача уже вернулась в очередь (Redis) — журнал после, его сбой
  // ответ не роняет.
  await createAdminAuditLogSafe({
    adminUserId: auth.user.id,
    action: "QUEUE_JOB_RETRIED",
    targetType: "queue-dead-letter",
    details: { index },
    context: getAdminAuditContext(request),
  });

  return ok({ ok: true, index });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ index: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const params = await context.params;
  const index = parseIndex(params.index);
  if (index === null) {
    return fail("Некорректный индекс.", 400, "VALIDATION_ERROR");
  }

  const removed = await deleteDeadJobByIndex(index);
  if (!removed) {
    return fail("Задача в очереди не найдена.", 404, "NOT_FOUND");
  }
  await createAdminAuditLogSafe({
    adminUserId: auth.user.id,
    action: "QUEUE_JOB_DELETED",
    targetType: "queue-dead-letter",
    details: { index },
    context: getAdminAuditContext(request),
  });

  return ok({ ok: true, index });
}

