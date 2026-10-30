import { fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";

/**
 * ADMIN-AUDIT-COVERAGE (SECURITY-EXPOSURE-AUDIT-01 · Y14) — легаси `PATCH`
 * (снять жалобу с отзыва) и `DELETE` (мягко удалить отзыв) **выведены → 410**,
 * по образцу `api/admin/billing/route.ts`.
 *
 * Оба писали в базу без строки `AdminAuditLog` (инв. #18): `DELETE` ещё и в
 * обход рассылки «отзыв удалён». Вызывающих не было — интерфейс модерации ходит
 * в выделенные роуты с аудитом:
 *   - удалить отзыв — `POST /api/admin/reviews/[id]/delete`
 *     (`delete-review.service.ts`: аудит `REVIEW_DELETED` + уведомление);
 *   - снять жалобу / одобрить — `POST /api/admin/reviews/[id]/approve`
 *     (`approve-review.service.ts`: аудит `REVIEW_APPROVED`).
 *
 * Проверка входа идёт первой, чтобы 410 не был ответом на неавторизованный
 * запрос к админскому адресу.
 */

const RETIRED_MESSAGE =
  "Этот адрес выведен из эксплуатации. Удаляйте отзыв через /api/admin/reviews/[id]/delete, снимайте жалобу через /api/admin/reviews/[id]/approve.";

export async function PATCH() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;
  return fail(RETIRED_MESSAGE, 410, "ENDPOINT_RETIRED");
}

export async function DELETE() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;
  return fail(RETIRED_MESSAGE, 410, "ENDPOINT_RETIRED");
}
