import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { processYookassaWebhookPayload } from "@/lib/payments/yookassa/webhook-processor";

/**
 * YOOKASSA-PENDING-SWEEP (2026-10-30, находка A-02) — сверка зависших платежей.
 *
 * Активация оплаты держалась на ОДНОМ уведомлении ЮКассы. Роут вебхука отвечает
 * 200 сразу после постановки задачи, поэтому ЮКасса его больше не присылает, и
 * всё дальнейшее зависело от задачи в очереди: сбой API ЮКассы дольше её
 * повторов, потерянная очередь или уведомление, не дошедшее вовсе (неверный URL
 * в личном кабинете, сеть), оставляли деньги списанными, строку `BillingPayment`
 * в PENDING, а подписку неактивной. Восстановить можно было только вручную.
 *
 * Свип перечитывает такие платежи тем же путём, что и вебхук:
 * `processYookassaWebhookPayload` с `payment.succeeded` и id платежа в ЮКассе.
 * Событие — только подсказка: решение принимается по статусу, который вернул API
 * (инв. #5), поэтому оплаченный платёж выдаёт подписку, брошенный — закрывается
 * как CANCELED (ЮКасса отменяет неоплаченные сама), а ещё не завершённый остаётся
 * PENDING до следующего прохода. Идемпотентность — ранний выход на SUCCEEDED и
 * условная запись исхода по статусу строки (`webhook-processor.ts`), поэтому
 * свип и задача вебхука, пришедшие к одному платежу одновременно, подписку
 * дважды не выдают.
 *
 * Окно — от 15 минут до 7 суток с создания. Младше 15 минут платёж почти всегда
 * ещё обрабатывается обычным путём (пользователь на странице оплаты, уведомление
 * в пути). Старше 7 суток — не наш случай: строки без исхода такого возраста
 * ловит ежедневный алерт «Billing payments stuck in PENDING» прогона продлений,
 * и разбирает человек. Строки без `yookassaPaymentId` пропускаются: checkout мог
 * упасть до ответа ЮКассы, спрашивать нечего.
 *
 * Отказы. Проход идёт по старшим первыми, страницами по ключу (`createdAt`,
 * `id`), поэтому платёж, который ЮКасса держит в pending, не загораживает
 * остальные. Отказ на одном платеже (сеть, 5xx, база) — не повод бросать всё,
 * но три подряд означают, что лежит сама зависимость: проход останавливается,
 * следующий через 10 минут. Отказы пишутся в лог без алерта (`__skipAlert`):
 * сбой API ЮКассы и так сигналит падением задач вебхука и их dead-letter
 * (`job.deadLetter`, тег `jobType`), а платёж, который свип не может закрыть
 * часами, попадает в ежедневный алерт зависших PENDING — третий канал о том же
 * был бы дублем.
 */

export const PENDING_SWEEP_MIN_AGE_MS = 15 * 60 * 1000;
export const PENDING_SWEEP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PENDING_SWEEP_PAGE_SIZE = 100;
/** Потолок прохода: 5 страниц по 100 — при 10-секундном таймауте запроса проход конечен. */
export const PENDING_SWEEP_MAX_PAGES = 5;
export const PENDING_SWEEP_MAX_CONSECUTIVE_FAILURES = 3;

export type PendingSweepSummary = {
  /** Платежей, которые удалось перечитать. */
  checked: number;
  /** Из них стали SUCCEEDED — подписка выдана свипом, уведомление потерялось или опоздало. */
  succeeded: number;
  /** Стали CANCELED / FAILED — брошенный или отклонённый платёж закрыт. */
  canceled: number;
  /** Остались PENDING — ЮКасса ещё не дала исхода (или не знает платежа). */
  stillPending: number;
  /** Отказы при перечитывании. */
  failed: number;
  /** Проход остановлен после серии отказов подряд. */
  stopped: boolean;
};

type Cursor = { createdAt: Date; id: string };

export async function sweepPendingYookassaPayments(now: Date = new Date()): Promise<PendingSweepSummary> {
  const summary: PendingSweepSummary = {
    checked: 0,
    succeeded: 0,
    canceled: 0,
    stillPending: 0,
    failed: 0,
    stopped: false,
  };
  const newest = new Date(now.getTime() - PENDING_SWEEP_MIN_AGE_MS);
  const oldest = new Date(now.getTime() - PENDING_SWEEP_MAX_AGE_MS);

  let cursor: Cursor | null = null;
  let consecutiveFailures = 0;
  let lastError: string | null = null;

  for (let page = 0; page < PENDING_SWEEP_MAX_PAGES; page += 1) {
    const rows: Array<{ id: string; createdAt: Date; yookassaPaymentId: string | null }> =
      await prisma.billingPayment.findMany({
        where: {
          status: "PENDING",
          yookassaPaymentId: { not: null },
          createdAt: { gte: oldest, lt: newest },
          ...(cursor
            ? {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: PENDING_SWEEP_PAGE_SIZE,
        select: { id: true, createdAt: true, yookassaPaymentId: true },
      });

    for (const row of rows) {
      if (!row.yookassaPaymentId) continue;
      try {
        await processYookassaWebhookPayload({
          event: "payment.succeeded",
          objectId: row.yookassaPaymentId,
        });
        const after = await prisma.billingPayment.findUnique({
          where: { id: row.id },
          select: { status: true },
        });
        consecutiveFailures = 0;
        summary.checked += 1;
        if (after?.status === "SUCCEEDED") summary.succeeded += 1;
        else if (after?.status === "CANCELED" || after?.status === "FAILED") summary.canceled += 1;
        else summary.stillPending += 1;
      } catch (error) {
        summary.failed += 1;
        consecutiveFailures += 1;
        lastError = error instanceof Error ? error.message : String(error);
        if (consecutiveFailures >= PENDING_SWEEP_MAX_CONSECUTIVE_FAILURES) {
          summary.stopped = true;
          break;
        }
      }
    }

    if (summary.stopped || rows.length < PENDING_SWEEP_PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }

  if (summary.failed > 0) {
    logError("billing.yookassa.pendingSweep.failures", {
      ...summary,
      lastError,
      __skipAlert: true,
    });
  }
  return summary;
}
