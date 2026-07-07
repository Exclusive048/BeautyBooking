import type { BillingPaymentStatus } from "@prisma/client";

import { sha256 } from "@/lib/billing/utils";

export type RefundDecision =
  | {
      ok: false;
      code: "PAYMENT_NOT_REFUNDABLE" | "PARTIAL_REFUND_NOT_SUPPORTED";
      status: number;
      message: string;
    }
  | { ok: true; refundAmountKopeks: number; idempotenceKey: string };

/**
 * Pure admin-refund guard (HARDENING-03 FIX-11). Enforces:
 *  1. Only a SUCCEEDED payment can be refunded — a PENDING/FAILED/CANCELED row
 *     never charged the customer, and an already-REFUNDED row must not refund
 *     twice (the refund webhook + admin route converge on one REFUNDED write).
 *  2. Full refunds only — a partial would flip the whole row to REFUNDED,
 *     masking the still-paid remainder (partial accounting is a deferred
 *     feature: PARTIALLY_REFUNDED + refundedKopeks).
 *  3. A deterministic, time-independent idempotency key so a repeated identical
 *     call (even an hour later) resolves to the SAME YooKassa refund.
 */
export function decideRefund(input: {
  yookassaPaymentId: string;
  paymentStatus: BillingPaymentStatus;
  paymentAmountKopeks: number;
  requestedAmountKopeks?: number | null;
}): RefundDecision {
  if (input.paymentStatus !== "SUCCEEDED") {
    return {
      ok: false,
      code: "PAYMENT_NOT_REFUNDABLE",
      status: 409,
      message: "Возврат возможен только для успешно проведённого платежа.",
    };
  }

  const refundAmountKopeks = input.requestedAmountKopeks ?? input.paymentAmountKopeks;
  if (refundAmountKopeks !== input.paymentAmountKopeks) {
    return {
      ok: false,
      code: "PARTIAL_REFUND_NOT_SUPPORTED",
      status: 400,
      message: "Доступен только полный возврат платежа.",
    };
  }

  return {
    ok: true,
    refundAmountKopeks,
    idempotenceKey: sha256(`refund:${input.yookassaPaymentId}:full`),
  };
}
