export type HotSlotDiscountType = "PERCENT" | "FIXED";

function normalizePrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function calculateDiscountedPrice(
  discountType: HotSlotDiscountType,
  discountValue: number,
  originalPrice: number
): number {
  const base = normalizePrice(originalPrice);
  const value = normalizePrice(discountValue);

  if (discountType === "FIXED") {
    return Math.max(0, base - value);
  }

  const percent = Math.min(100, value);
  return Math.max(0, Math.round(base * (1 - percent / 100)));
}

export function calculateDiscountPercent(
  discountType: HotSlotDiscountType,
  discountValue: number,
  originalPrice: number
): number {
  const base = normalizePrice(originalPrice);
  const value = normalizePrice(discountValue);

  if (discountType === "PERCENT") {
    return Math.min(100, value);
  }

  if (base <= 0) return 0;
  return Math.min(100, Math.round((Math.min(base, value) / base) * 100));
}

