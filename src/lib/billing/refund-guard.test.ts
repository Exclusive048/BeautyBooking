import { describe, it, expect } from "vitest";
import { decideRefund } from "@/lib/billing/refund-guard";

const YK = "yk-pay-123";
const FULL = 149_000; // kopeks

describe("decideRefund — HARDENING-03 FIX-11", () => {
  it("SUCCEEDED + amount omitted → full refund, ok", () => {
    const d = decideRefund({
      yookassaPaymentId: YK,
      paymentStatus: "SUCCEEDED",
      paymentAmountKopeks: FULL,
      requestedAmountKopeks: null,
    });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.refundAmountKopeks).toBe(FULL);
      expect(d.idempotenceKey).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("SUCCEEDED + explicit full amount → ok", () => {
    const d = decideRefund({
      yookassaPaymentId: YK,
      paymentStatus: "SUCCEEDED",
      paymentAmountKopeks: FULL,
      requestedAmountKopeks: FULL,
    });
    expect(d.ok).toBe(true);
  });

  it("SUCCEEDED + partial (less) → rejected PARTIAL_REFUND_NOT_SUPPORTED (400)", () => {
    const d = decideRefund({
      yookassaPaymentId: YK,
      paymentStatus: "SUCCEEDED",
      paymentAmountKopeks: FULL,
      requestedAmountKopeks: FULL - 1,
    });
    expect(d).toMatchObject({ ok: false, code: "PARTIAL_REFUND_NOT_SUPPORTED", status: 400 });
  });

  it("SUCCEEDED + more than full → rejected PARTIAL_REFUND_NOT_SUPPORTED (400)", () => {
    const d = decideRefund({
      yookassaPaymentId: YK,
      paymentStatus: "SUCCEEDED",
      paymentAmountKopeks: FULL,
      requestedAmountKopeks: FULL + 1,
    });
    expect(d).toMatchObject({ ok: false, code: "PARTIAL_REFUND_NOT_SUPPORTED", status: 400 });
  });

  it.each(["PENDING", "FAILED", "CANCELED", "REFUNDED"] as const)(
    "%s payment → rejected PAYMENT_NOT_REFUNDABLE (409)",
    (status) => {
      const d = decideRefund({
        yookassaPaymentId: YK,
        paymentStatus: status,
        paymentAmountKopeks: FULL,
        requestedAmountKopeks: null,
      });
      expect(d).toMatchObject({ ok: false, code: "PAYMENT_NOT_REFUNDABLE", status: 409 });
    }
  );

  it("REFUNDED payment cannot refund twice (guards the double-refund path)", () => {
    const d = decideRefund({
      yookassaPaymentId: YK,
      paymentStatus: "REFUNDED",
      paymentAmountKopeks: FULL,
      requestedAmountKopeks: FULL,
    });
    expect(d.ok).toBe(false);
  });

  describe("deterministic idempotency (no per-hour time bucket)", () => {
    it("repeated identical call (even an hour later) → SAME key", () => {
      const call = () =>
        decideRefund({
          yookassaPaymentId: YK,
          paymentStatus: "SUCCEEDED",
          paymentAmountKopeks: FULL,
          requestedAmountKopeks: FULL,
        });
      const a = call();
      const b = call(); // conceptually a retry an hour later — no time input exists
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        expect(a.idempotenceKey).toBe(b.idempotenceKey);
      }
    });

    it("different payment → different key", () => {
      const base = {
        paymentStatus: "SUCCEEDED" as const,
        paymentAmountKopeks: FULL,
        requestedAmountKopeks: FULL,
      };
      const a = decideRefund({ ...base, yookassaPaymentId: "yk-a" });
      const b = decideRefund({ ...base, yookassaPaymentId: "yk-b" });
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        expect(a.idempotenceKey).not.toBe(b.idempotenceKey);
      }
    });
  });
});
