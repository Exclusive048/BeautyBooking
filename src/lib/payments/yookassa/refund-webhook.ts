import { prisma } from "@/lib/prisma";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { moneyRUBFromKopeks } from "@/lib/format";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { apiAmountToKopeks } from "@/lib/payments/yookassa/amount";
import { getPayment, getRefund, type YookassaRefundResponse } from "@/lib/payments/yookassa/client";

/**
 * Событие `refund.*` от ЮКассы (вызывается из `processYookassaWebhookPayload`).
 *
 * Как и у платежей, тело уведомления — недоверенная подсказка (инв. #5):
 * возврат перечитывается из API, и решение принимается только по его статусу и
 * сумме.
 *
 * PARTIAL-REFUND-ACCOUNTING (2026-10-30). Раньше любой успешный возврат помечал
 * платёж REFUNDED. Админка делает только полный возврат (`decideRefund` →
 * `PARTIAL_REFUND_NOT_SUPPORTED`), но частичный можно провести в личном
 * кабинете ЮКассы, и тогда платёж на 1000 ₽ с возвратом 100 ₽ числился
 * возвращённым целиком. Статуса «частично возвращён» в схеме нет
 * (`BillingPaymentStatus`), а заводить его ради редкого ручного случая — значит
 * менять схему и все места, читающие статус. Поэтому частичный возврат статус
 * НЕ меняет, а остаётся на человеке: запись в журнале биллинга с суммами и
 * алерт в Telegram.
 *
 * Полный — это когда возвращено не меньше суммы платежа: одним возвратом либо
 * в сумме (`refunded_amount` платежа в ЮКассе — накопленная сумма возвратов).
 * Сумма платежа берётся из нашей строки `BillingPayment` (FIX-BC-4), не из
 * уведомления. Если суммы не прочитались — возврат считается частичным: лучше
 * попросить человека разобраться, чем молча закрыть платёж.
 */

export const PARTIAL_REFUND_AUDIT_ACTION = "PAYMENT_PARTIALLY_REFUNDED";

/** Один алерт на возврат; повтор того же уведомления в течение суток молчит. */
const PARTIAL_REFUND_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type RefundAmounts = {
  /** Сумма платежа по нашей строке `BillingPayment`. */
  paymentKopeks: number;
  /** Сумма этого возврата из API; `null` — не прочиталась. */
  refundKopeks: number | null;
  /** Всего возвращено по платежу (`refunded_amount` из API); `null` — не запрашивали или не прочиталась. */
  refundedTotalKopeks: number | null;
};

/** Полный или частичный возврат. Неизвестная сумма — частичный (ручной разбор). */
export function classifyRefundCoverage(amounts: RefundAmounts): "full" | "partial" {
  const known = [amounts.refundKopeks, amounts.refundedTotalKopeks].filter(
    (value): value is number => value !== null,
  );
  if (known.length === 0) return "partial";
  return Math.max(...known) >= amounts.paymentKopeks ? "full" : "partial";
}

/**
 * Суммы возврата. Платёж перечитывается, только если этот возврат сам не
 * покрывает платёж: тогда решает накопленная сумма — несколько частичных
 * возвратов вместе могут вернуть всё. `getPayment` бросает на временном сбое —
 * задача очереди повторится, как и при сбое `getRefund`.
 */
async function resolveRefundAmounts(
  refund: YookassaRefundResponse,
  paymentKopeks: number,
): Promise<RefundAmounts> {
  const refundKopeks = apiAmountToKopeks(refund.amount);
  if (refundKopeks !== null && refundKopeks >= paymentKopeks) {
    return { paymentKopeks, refundKopeks, refundedTotalKopeks: null };
  }
  const apiPayment = await getPayment(refund.payment_id);
  return {
    paymentKopeks,
    refundKopeks,
    refundedTotalKopeks: apiAmountToKopeks(apiPayment?.refunded_amount),
  };
}

function kopeksLabel(kopeks: number | null): string {
  return kopeks === null ? "сумма не прочиталась" : moneyRUBFromKopeks(kopeks);
}

export async function processYookassaRefundEvent(refundId: string): Promise<void> {
  // getRefund: null on 404 (forged/foreign → drop); throws on transient
  // failure (→ the queue retries the job).
  const refund = await getRefund(refundId);
  if (!refund) {
    logInfo("YooKassa refund not found via API (forged/foreign) — dropped", { objectId: refundId });
    return;
  }
  if (refund.status !== "succeeded") {
    logInfo("YooKassa refund not succeeded — no action", { objectId: refundId, status: refund.status });
    return;
  }

  const billingPayment = await prisma.billingPayment.findUnique({
    where: { yookassaPaymentId: refund.payment_id },
    select: {
      id: true,
      status: true,
      amountKopeks: true,
      subscriptionId: true,
      subscription: { select: { userId: true, scope: true } },
    },
  });
  if (!billingPayment) {
    logError("YooKassa refund: payment not found", { yookassaPaymentId: refund.payment_id });
    return;
  }
  // Idempotent: a duplicate / 24h-redelivered refund notification (or a
  // refund already recorded synchronously by the admin refund route) is a
  // no-op — no second REFUNDED write, no duplicate audit.
  if (billingPayment.status === "REFUNDED") {
    return;
  }

  const amounts = await resolveRefundAmounts(refund, billingPayment.amountKopeks);
  const auditBase = {
    userId: billingPayment.subscription.userId,
    scope: billingPayment.subscription.scope,
    subscriptionId: billingPayment.subscriptionId,
    paymentId: billingPayment.id,
  };
  const details = {
    yookassaPaymentId: refund.payment_id,
    yookassaRefundId: refund.id,
    paymentKopeks: amounts.paymentKopeks,
    refundKopeks: amounts.refundKopeks,
    refundedTotalKopeks: amounts.refundedTotalKopeks,
  };

  if (classifyRefundCoverage(amounts) === "full") {
    await prisma.billingPayment.update({
      where: { id: billingPayment.id },
      data: { status: "REFUNDED" },
    });
    await createBillingAuditLog({ ...auditBase, action: "PAYMENT_REFUNDED", details });
    return;
  }

  // Частичный: статус платежа не трогаем. Повтор того же уведомления (ЮКасса
  // переотправляет до суток) не пишет вторую запись и не шлёт второй алерт —
  // запись журнала по id возврата и есть отметка «уже учтён».
  const alreadyRecorded = await prisma.billingAuditLog.findFirst({
    where: {
      paymentId: billingPayment.id,
      action: PARTIAL_REFUND_AUDIT_ACTION,
      details: { path: ["yookassaRefundId"], equals: refund.id },
    },
    select: { id: true },
  });
  if (alreadyRecorded) {
    logInfo("YooKassa partial refund already recorded — no action", {
      paymentId: billingPayment.id,
      yookassaRefundId: refund.id,
    });
    return;
  }

  await createBillingAuditLog({ ...auditBase, action: PARTIAL_REFUND_AUDIT_ACTION, details });
  logInfo("YooKassa partial refund — payment status left as is, manual review required", {
    paymentId: billingPayment.id,
    paymentStatus: billingPayment.status,
    ...details,
  });
  // Без ПДн: только id платежа и возврата и суммы.
  void sendTelegramAlert(
    [
      "Частичный возврат ЮКассы — разобрать вручную.",
      `Платёж ${billingPayment.id} (ЮКасса ${refund.payment_id}), возврат ${refund.id}.`,
      `Возврат: ${kopeksLabel(amounts.refundKopeks)}; всего возвращено: ${kopeksLabel(amounts.refundedTotalKopeks)}; сумма платежа: ${kopeksLabel(amounts.paymentKopeks)}.`,
      `Статус платежа не менялся (${billingPayment.status}), подписка не тронута.`,
    ].join("\n"),
    `yookassa:partial-refund:${refund.id}`,
    PARTIAL_REFUND_ALERT_COOLDOWN_MS,
  ).catch(() => undefined);
}
