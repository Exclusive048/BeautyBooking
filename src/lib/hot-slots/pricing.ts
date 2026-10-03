import { rublesToKopeks } from "@/lib/money/kopeks";

export type HotSlotDiscountType = "PERCENT" | "FIXED";

function normalizePrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * HOT-SLOT-FIXED-UNIT — фиксированная скидка горящего окошка в копейках.
 *
 * `DiscountRule.discountValue` / `HotSlot.discountValue` при `FIXED` хранятся
 * в РУБЛЯХ: так их задаёт правило (`hotSlotRuleSchema` — диапазон
 * `HOT_SLOT_FIXED_MIN..MAX` = 100..5000 ₽, сообщение об ошибке форматирует его
 * через `× 100`), так их показывают витрина (`-{v} ₽`, главная считает
 * `price − v × 100`) и уведомления (`{v} руб.`). Цены услуг — копейки, а здесь
 * сырое значение вычиталось из копеек: скидка 500 ₽ становилась скидкой 5 ₽ и
 * в `/slots` (`discountedPrice`), и в цене брони. Единица переводится здесь —
 * в единственной точке, через которую идёт вся математика горящих окошек
 * (`runtime.ts` → `/slots`, `/api/hot-slots`, `resolveBookingServicePrice`).
 *
 * Не путать с `ServicePackage.discountValue`: у пакетов FIXED хранится в
 * копейках (модалки пакетов переводят ввод `× 100`).
 */
export function hotSlotFixedDiscountKopeks(discountValueRubles: number): number {
  return rublesToKopeks(normalizePrice(discountValueRubles));
}

export function calculateDiscountedPrice(
  discountType: HotSlotDiscountType,
  discountValue: number,
  originalPrice: number
): number {
  const base = normalizePrice(originalPrice);

  if (discountType === "FIXED") {
    return Math.max(0, base - hotSlotFixedDiscountKopeks(discountValue));
  }

  const percent = Math.min(100, normalizePrice(discountValue));
  return Math.max(0, Math.round(base * (1 - percent / 100)));
}

export function calculateDiscountPercent(
  discountType: HotSlotDiscountType,
  discountValue: number,
  originalPrice: number
): number {
  const base = normalizePrice(originalPrice);

  if (discountType === "PERCENT") {
    return Math.min(100, normalizePrice(discountValue));
  }

  if (base <= 0) return 0;
  const discountKopeks = hotSlotFixedDiscountKopeks(discountValue);
  return Math.min(100, Math.round((Math.min(base, discountKopeks) / base) * 100));
}
