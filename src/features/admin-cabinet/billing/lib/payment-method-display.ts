/**
 * Extracts a human-readable payment-method label from the YooKassa
 * `metadata` blob that BillingPayment stores opaquely. YooKassa's
 * webhook payload nests the title under `payment_method.title`
 * (e.g. "Bank card *4444", "СБП", "Сбер Бизнес"), but the field is
 * optional — we have no schema-level guarantee it will be present.
 *
 * Returns `null` when the blob is absent, malformed, or doesn't carry
 * a title. Callers render «—» in that case. A future commit could
 * snapshot the title into a dedicated column for cleaner display +
 * indexed lookups — see BACKLOG.md.
 */
export function paymentMethodFromMetadata(
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;

  // Shape 1: webhook stored the YooKassa object verbatim — title under
  // `payment_method.title`.
  const paymentMethod = record.payment_method;
  if (paymentMethod && typeof paymentMethod === "object") {
    const title = (paymentMethod as Record<string, unknown>).title;
    if (typeof title === "string" && title.trim().length > 0) {
      return title.trim();
    }
  }

  // Shape 2: caller pre-flattened — direct `paymentMethod` string.
  if (typeof record.paymentMethod === "string" && record.paymentMethod.trim()) {
    return record.paymentMethod.trim();
  }

  return null;
}
