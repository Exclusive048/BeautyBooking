import { ProviderType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { resolveBookingServicePrice } from "@/lib/bookings/hot-slot-pricing";
import { HOT_SLOT_FIXED_MAX, HOT_SLOT_FIXED_MIN } from "@/lib/hot-slots/constants";
import {
  calculateDiscountPercent,
  calculateDiscountedPrice,
  hotSlotFixedDiscountKopeks,
} from "@/lib/hot-slots/pricing";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { hotSlotRuleSchema } from "@/lib/hot-slots/schemas";

/**
 * HOT-SLOT-FIXED-UNIT — фиксированная скидка горящего окошка хранится в
 * рублях (правило задаётся в ₽, витрина и уведомления показывают ₽), а цены
 * услуг — в копейках. Раньше `calculateDiscountedPrice` вычитал сырое значение
 * из копеек: скидка 500 ₽ давала 5 ₽ и в `/slots`, и в цене брони.
 *
 * @probe 2026-10-03 — в `calculateDiscountedPrice` возвращено `base - value`
 *        (без перевода в копейки): краснеют четыре FIXED-кейса (199 500
 *        вместо 150 000 и т. п.). Возвращено — зелёный.
 */

const SERVICE_PRICE = 200_000; // 2 000 ₽ в копейках

describe("горящее окошко: FIXED-скидка — рубли, цена — копейки", () => {
  it("скидка 500 ₽ с услуги за 2 000 ₽ — 1 500 ₽ и 25 %", () => {
    expect(calculateDiscountedPrice("FIXED", 500, SERVICE_PRICE)).toBe(150_000);
    expect(calculateDiscountPercent("FIXED", 500, SERVICE_PRICE)).toBe(25);
  });

  it("скидка больше цены — 0 и 100 %, не отрицательная цена", () => {
    expect(calculateDiscountedPrice("FIXED", 5000, SERVICE_PRICE)).toBe(0);
    expect(calculateDiscountPercent("FIXED", 5000, SERVICE_PRICE)).toBe(100);
  });

  it("граница правила: допустимый диапазон схемы — это рубли", () => {
    // Схема пропускает ровно 100..5000 и сама называет их рублями.
    const parsed = hotSlotRuleSchema.safeParse({
      isEnabled: true,
      triggerHours: 3,
      discountType: "FIXED",
      discountValue: HOT_SLOT_FIXED_MAX + 1,
      applyMode: "ALL_SERVICES",
      serviceIds: [],
    });
    expect(parsed.success).toBe(false);
    const message = parsed.success ? "" : parsed.error.issues[0]?.message ?? "";
    expect(message).toMatch(/100\s*₽/);
    expect(message).toMatch(/5\s*000\s*₽/);
    expect(hotSlotFixedDiscountKopeks(HOT_SLOT_FIXED_MIN)).toBe(10_000);
    expect(hotSlotFixedDiscountKopeks(HOT_SLOT_FIXED_MAX)).toBe(500_000);
  });

  it("мусор не ломает расчёт", () => {
    expect(hotSlotFixedDiscountKopeks(Number.NaN)).toBe(0);
    expect(hotSlotFixedDiscountKopeks(-300)).toBe(0);
    expect(calculateDiscountPercent("FIXED", 500, 0)).toBe(0);
  });

  it("процентная ветка не изменилась", () => {
    expect(calculateDiscountedPrice("PERCENT", 20, SERVICE_PRICE)).toBe(160_000);
    expect(calculateDiscountPercent("PERCENT", 20, SERVICE_PRICE)).toBe(20);
    expect(calculateDiscountedPrice("PERCENT", 150, SERVICE_PRICE)).toBe(0);
  });
});

const START = new Date("2026-09-01T12:00:00.000Z");
const NOW = new Date(START.getTime() - 2 * 60 * 60 * 1000);
const FIXED_RULE = {
  isEnabled: true,
  triggerHours: 3,
  discountType: "FIXED" as const,
  discountValue: 500,
  applyMode: "ALL_SERVICES" as const,
  minPriceFrom: null,
  serviceIds: [] as string[],
};

describe("FIXED-скидка доходит до /slots и до цены брони в копейках", () => {
  it("runtime: discountedPrice в копейках, discountValue остаётся рублями", () => {
    const hot = resolveDynamicHotSlotPricing({
      rule: FIXED_RULE,
      slotStartAtUtc: START,
      serviceId: "svc-1",
      servicePrice: SERVICE_PRICE,
      providerTimeZone: "Europe/Moscow",
      now: NOW,
    });
    expect(hot).toMatchObject({
      isHot: true,
      originalPrice: SERVICE_PRICE,
      discountedPrice: 150_000,
      discountPercent: 25,
      discountType: "FIXED",
      discountValue: 500,
    });
  });

  it("чокпойнт брони: цена записи — 1 500 ₽, а не 1 995 ₽", async () => {
    const db = {
      discountRule: { findUnique: async () => FIXED_RULE },
      booking: { findFirst: async () => null },
    } as unknown as Parameters<typeof resolveBookingServicePrice>[0]["db"];

    const price = await resolveBookingServicePrice({
      db,
      providerId: "prov-master",
      providerType: ProviderType.MASTER,
      resolvedMasterProviderId: "prov-master",
      clientUserId: "user-1",
      serviceId: "svc-1",
      basePrice: SERVICE_PRICE,
      startAtUtc: START,
      providerTimeZone: "Europe/Moscow",
      hotSlotRequested: false,
      now: NOW,
    });
    expect(price).toBe(150_000);
  });
});
