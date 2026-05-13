import { describe, expect, it } from "vitest";
import {
  buildPlanEditedSummary,
  buildPlanGrantedBody,
  buildRefundBody,
  buildReviewDeletedByAdminBody,
  buildSubscriptionCancelledByAdminBody,
  formatMonths,
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  truncatePushBody,
  truncatePushTitle,
} from "./admin-body-templates";

describe("formatMonths", () => {
  it("uses singular for 1", () => {
    expect(formatMonths(1)).toBe("1 месяц");
  });

  it("uses few-form for 2-4", () => {
    expect(formatMonths(2)).toBe("2 месяца");
    expect(formatMonths(3)).toBe("3 месяца");
    expect(formatMonths(4)).toBe("4 месяца");
  });

  it("uses many-form for 5-10", () => {
    expect(formatMonths(5)).toBe("5 месяцев");
    expect(formatMonths(10)).toBe("10 месяцев");
  });

  it("uses many-form for 11-14 (Russian exception)", () => {
    expect(formatMonths(11)).toBe("11 месяцев");
    expect(formatMonths(12)).toBe("12 месяцев");
    expect(formatMonths(14)).toBe("14 месяцев");
  });
});

describe("buildPlanGrantedBody", () => {
  it("includes plan name and period", () => {
    expect(
      buildPlanGrantedBody({ planName: "PREMIUM", periodMonths: 3 }),
    ).toBe("Администратор подарил тариф «PREMIUM» на 3 месяца.");
  });

  it("appends reason if provided", () => {
    expect(
      buildPlanGrantedBody({
        planName: "PRO",
        periodMonths: 1,
        reason: "компенсация",
      }),
    ).toBe(
      "Администратор подарил тариф «PRO» на 1 месяц. Причина: компенсация.",
    );
  });

  it("ignores empty/whitespace reason", () => {
    expect(
      buildPlanGrantedBody({ planName: "PRO", periodMonths: 12, reason: "  " }),
    ).toBe("Администратор подарил тариф «PRO» на 12 месяцев.");
  });
});

describe("buildPlanEditedSummary", () => {
  it("returns null for empty diff", () => {
    expect(buildPlanEditedSummary({})).toBeNull();
  });

  it("returns null when isActive is provided but identical", () => {
    // Defensive: callers should pre-filter, but a no-op `name` change
    // shouldn't slip through either.
    expect(
      buildPlanEditedSummary({ name: { before: "PRO", after: "PRO" } }),
    ).toBeNull();
  });

  it("summarises a single price change", () => {
    const summary = buildPlanEditedSummary({
      prices: { "3m": { before: 290_000, after: 390_000 } },
    });
    expect(summary).toContain("цена за 3 месяца");
    // Russian locale formatting inserts non-breaking spaces (NBSP) as
    // thousands separators — assert against the actual code point.
    expect(summary).toContain("2 900");
    expect(summary).toContain("3 900");
  });

  it("combines multiple changes with semicolons", () => {
    const summary = buildPlanEditedSummary({
      name: { before: "PRO", after: "PRO+" },
      prices: { "1m": { before: 100_000, after: 120_000 } },
    });
    expect(summary).toContain("название изменилось");
    expect(summary).toContain("цена за 1 месяц");
    expect(summary).toContain(";");
  });

  it("describes deactivation", () => {
    const summary = buildPlanEditedSummary({
      isActive: { before: true, after: false },
    });
    expect(summary).toContain("приостановлен");
  });
});

describe("buildSubscriptionCancelledByAdminBody", () => {
  it("includes plan name and formatted access-until date", () => {
    const body = buildSubscriptionCancelledByAdminBody({
      planName: "Premium",
      accessUntil: new Date("2026-06-01T10:00:00Z"),
    });
    expect(body).toContain("«Premium»");
    expect(body).toMatch(/Доступ сохранится до .+ 2026/);
  });

  it("falls back to generic copy when accessUntil is null", () => {
    const body = buildSubscriptionCancelledByAdminBody({
      planName: "PRO",
      accessUntil: null,
    });
    expect(body).toContain("до конца оплаченного периода");
  });

  it("appends reason", () => {
    const body = buildSubscriptionCancelledByAdminBody({
      planName: "PRO",
      accessUntil: null,
      reason: "нарушение условий",
    });
    expect(body).toContain("Причина: нарушение условий");
  });
});

describe("buildRefundBody", () => {
  it("formats amount in rubles", () => {
    const body = buildRefundBody({ amountKopeks: 199_000 });
    // ru-RU `toLocaleString` uses NBSP between groups and before the unit.
    expect(body).toMatch(/1\s990\s₽/u);
    expect(body).toContain("возвращён");
  });

  it("mentions payment method when supplied", () => {
    const body = buildRefundBody({
      amountKopeks: 50_000,
      paymentMethodDisplay: "Visa *4242",
    });
    expect(body).toContain("Visa *4242");
  });

  it("works without method", () => {
    const body = buildRefundBody({ amountKopeks: 50_000 });
    expect(body).not.toContain("на null");
  });
});

describe("buildReviewDeletedByAdminBody", () => {
  it("includes target name", () => {
    expect(
      buildReviewDeletedByAdminBody({ targetName: "Анна С." }),
    ).toContain("«Анна С.»");
  });

  it("falls back without target name", () => {
    expect(buildReviewDeletedByAdminBody({ targetName: null })).toBe(
      "Ваш отзыв удалён администратором.",
    );
  });

  it("appends reason", () => {
    const body = buildReviewDeletedByAdminBody({
      targetName: "Студия Х",
      reason: "оскорбительный текст",
    });
    expect(body).toContain("Причина: оскорбительный текст");
  });
});

describe("truncatePushBody / truncatePushTitle", () => {
  it("leaves short body untouched", () => {
    expect(truncatePushBody("short")).toBe("short");
  });

  it("truncates long body with ellipsis at PUSH_BODY_MAX", () => {
    const long = "a".repeat(PUSH_BODY_MAX + 50);
    const truncated = truncatePushBody(long);
    expect(truncated.length).toBe(PUSH_BODY_MAX);
    expect(truncated.endsWith("…")).toBe(true);
  });

  it("respects PUSH_TITLE_MAX", () => {
    const long = "x".repeat(PUSH_TITLE_MAX + 10);
    const truncated = truncatePushTitle(long);
    expect(truncated.length).toBe(PUSH_TITLE_MAX);
    expect(truncated.endsWith("…")).toBe(true);
  });
});
