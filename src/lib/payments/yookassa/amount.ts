/**
 * Сумма из ответа ЮКассы (`amount.value` — рубли строкой, «1000.00») → целые
 * копейки; `null`, если суммы нет или она не читается. Один разбор на
 * обработку платежей и возвратов (`webhook-processor.ts`, `refund-webhook.ts`).
 */
export function apiAmountToKopeks(
  amount: { value: string; currency: string } | undefined | null,
): number | null {
  if (!amount) return null;
  const rubles = Number.parseFloat(amount.value);
  if (!Number.isFinite(rubles)) return null;
  return Math.round(rubles * 100);
}
